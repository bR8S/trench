const express = require('express')
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const app = express()
const port = process.env.PORT || 3000;

const cookieParser = require("cookie-parser")
const { v4: uuidv4 } = require("uuid")
const userScrapeData = new Map()

puppeteer.use(StealthPlugin())
app.use(cookieParser());
app.use(express.json())
app.use(express.static('public'))

app.use((req, res, next) => {
    let userId = req.cookies.userId
    
    if (!userId) {
        userId = uuidv4() // Generate a new unique ID
        res.cookie("userId", userId, { httpOnly: true, sameSite: "Strict" })
    }

    if (!userScrapeData.has(userId)) {
        userScrapeData.set(userId, { progress: 0, status: "Not started", total: 0 })
    }

    req.userId = userId;
    req.scrapeData = userScrapeData.get(userId)
    next()
});

app.get('/scrape', async (req, res) => {
    const { scrapeData } = req

    // Update user-specific progress
    scrapeData.status = "In progress"
    scrapeData.progress = 0

    try{
        const scrapeFanCollection = async (fan, page) => {
            const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            await page.setUserAgent(randomUserAgent);

            // Your function logic here
            await page.goto(fan.profileUrl, { waitUntil: 'domcontentloaded' })

            await page.evaluate(() => {
                // Hide page footer
                const modal = document.querySelector("page-footer")
                if (modal) {
                    modal.style.display = 'none'; // Hide the modal
                }
            });

            // Click "View All" if necessary
            const viewAllSelector = '.collection-items .expand-container button.show-more'
            const expandContainerSelector = '.expand-container'

            const scrollToBottom = async () => {
                let previousHeight = 0;
                
                // Start by getting the initial height of the .collection-grid
                let currentHeight = await page.evaluate(() => {
                    const grid = document.querySelector('.collection-grid');
                    return grid ? grid.scrollHeight : 0; // Returns the height of the grid if it exists
                });
                
                // Continue scrolling until the height of .collection-grid stops changing
                while (previousHeight !== currentHeight) {
                    previousHeight = currentHeight;
                
                    // Incrementally scroll down the page
                    await page.evaluate(() => {
                        window.scrollBy(0, 5000); // Scroll 5000px downwards
                    })
                
                    // Wait for content to load
                    await new Promise(r => setTimeout(r, 1000)); // Adjust this as needed for content load time
                
                    // Get the new height of the .collection-grid element after scrolling
                    currentHeight = await page.evaluate(() => {
                        const grid = document.querySelector('.collection-grid');
                        return grid ? grid.scrollHeight : 0;
                    });
                }
            };

            if (await page.$(viewAllSelector)) {
                await page.click(viewAllSelector);
            
                // Wait for `.show-button` class to be removed
                await page.waitForFunction(
                    (selector) => {
                        const element = document.querySelector(selector);
                        return element && !element.classList.contains('show-button');
                    },
                    {},  // options
                    expandContainerSelector // selector passed here
                )

                await scrollToBottom()
            } else {
                //console.log("Button not found for user " + fan.name);
            }

            // Scrape the user data
            const collectionData = await page.evaluate(() => {
                const collectionElements = Array.from(document.querySelectorAll('.collection-item-container'))
                return collectionElements.map(collection => {
                const title = collection.querySelector('.collection-item-gallery-container .collection-item-title')?.innerText
                const artist = collection.querySelector('.collection-item-gallery-container .collection-item-artist')?.innerText
                const link = collection.querySelector('.collection-item-gallery-container .item-link')?.href
                const imageUrl = collection.querySelector('.collection-item-gallery-container .collection-item-art')?.src
                return { title, artist, link, imageUrl }
                });
            });

            return collectionData
        };

        const scrapeFans = async () => {
            // Go to the Bandcamp page (replace with your URL of choice)
            await page.goto(trackUrl, { waitUntil: 'domcontentloaded' });

            await page.waitForSelector('.deets.populated');

            // Scrape the user data
            const fansData = await page.evaluate(() => {
                const fanElements = Array.from(document.querySelectorAll('.deets.populated .fan.pic'))
                return fanElements.map(fan => {
                const profileUrl = fan.href
                const name = fan.querySelector('.name').innerText
                const imageUrl = fan.querySelector('.thumb').src
                return { profileUrl, name, imageUrl }
                });
            });

            await page.close()

            return fansData
        };

        const processBatch = async (batch, scraped) => {
            const inProgress = []  // Keeps track of ongoing promises

            // Split the fansData into batches of size MAX_CONCURRENCY_LIMIT (5)
            for (let i = 0; i < batch.length; i++) {
                const fan = batch[i];
                // Create a promise for this fan scraping task
                const task = (async () => {
                    try {
                        const fanPage = await browser.newPage()
                        const data = await scrapeFanCollection(fan, fanPage)
                        await fanPage.close()

                        scraped.push(fan)
                        scrapeData.progress = scraped.length

                        return data;

                    } catch (error) {
                        return null
                    }
                })();

                inProgress.push(task)
            }

            return Promise.all(inProgress)
        }
        
        const processInBatches = async (fansData) => {
            const results = []
            const scraped = []

            scrapeData.total = fansData.length
            // Process the fansData in batches of 5
            for (let i = 0; i < fansData.length; i += MAX_CONCURRENCY_LIMIT) {
                const batch = fansData.slice(i, i + MAX_CONCURRENCY_LIMIT);  // Slice the data into batches of 5
                const batchResults = await processBatch(batch, scraped);  // Process the current batch
                results.push(...batchResults);  // Collect the batch promises
            }

            return results
        }
        
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
            'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:44.0) Gecko/20100101 Firefox/44.0'
        ];

        // Launch browser
        const browser = await puppeteer.launch({
            headless: 'new', // Set to 'false' if you want to see the browser interact
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
	
        });

        const MAX_CONCURRENCY_LIMIT = 3
        const trackUrl = req.query.url

        const page = await browser.newPage(); // Create a new page
        const fansData = await scrapeFans(trackUrl) // Scrapes fans of givem track

        let allCollections = await processInBatches(fansData)

        const trackCountMap = new Map()

        // Step 2: Iterate over each sub-array and count the tracks
        allCollections.forEach(collection => {
            collection.forEach(track => {
                // Get the current count from the map, or default to 0 if it doesn't exist
                const existing = trackCountMap.get(track.title);
                
                // If the track exists, increment the count; otherwise, initialize it with count 1
                if (existing) {
                    existing.count += 1;
                } else {
                    trackCountMap.set(track.title, { track, count: 1 });
                }
            });
        });
        
        // Step 3: Convert the Map into a new array with track and count
        const tracksWithCount = [...trackCountMap.entries()].map(([title, { track, count }]) => ({
            title,
            track,
            count
        }));

        // Sorting by count in descending order (most frequent first)
        const sortedTracks = tracksWithCount.sort((a, b) => b.count - a.count);
        const top10 = sortedTracks.slice(1, 10)

        res.send(JSON.stringify(sortedTracks))
    }
    catch (error) {
        console.log(error)
    }
})

app.get('/scrape-progress', async (req, res) => {
    const { scrapeData } = req

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const interval = setInterval(() => {
        const progressData = {
            progress: scrapeData.progress,
            total: scrapeData.total
        };
        
        res.write(`data: ${JSON.stringify(progressData)}\n\n`);

        if (scrapeData.progress >= scrapeData.total) {
            clearInterval(interval);
            res.end();
        }
    }, 1000);

    req.on('close', () => clearInterval(interval)); // Cleanup on disconnect
})

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Gracefully close the server when nodemon restarts
process.on("SIGTERM", () => {
    console.log("Closing server...");
    server.close(() => {
        console.log("Server closed.");
        process.exit(0);
    });
});
