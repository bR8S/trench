const express = require('express')
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const app = express()
const port = 3000

puppeteer.use(StealthPlugin())
app.use(express.json())
app.use(express.static('public'))

app.get('/scrape', async (req, res) => {
    try{
        const scrapeFanCollection = async (fan) => {
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
                        window.scrollBy(0, 10000); // Scroll 10000px downwards
                    });
                
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
                .then(() => console.log("Click successful! 'show-button' class removed."))
                .catch(() => console.log("Click might have failed or class didn't change."));

                await scrollToBottom()
            } else {
                console.log("Button not found for user " + fan.name);
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

            return fansData
        };

        let allCollections = []

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
            'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:44.0) Gecko/20100101 Firefox/44.0'
        ];

        // Launch browser
        const browser = await puppeteer.launch({
            headless: false, // Set to 'false' if you want to see the browser interact
        });

        const page = await browser.newPage(); // Create a new page
        const trackUrl = req.query.url

        const fansData = await scrapeFans(trackUrl)

        for (const fan of fansData) {
            const data = await scrapeFanCollection(fan);
            allCollections.push(data)
        }

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
        const top10 = sortedTracks.slice(0, 10)

        res.send(JSON.stringify(top10))
    }
    catch (error) {
        console.log(error)
    }
})

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});