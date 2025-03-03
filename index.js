const puppeteer = require('puppeteer');

(async () => {
  const scrapeFanCollection = async (fan) => {
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
    
    if (await page.$(viewAllSelector)) {
        await page.click(viewAllSelector);

        // Wait for `.show-button` class to be removed
        await page.waitForFunction((selector) => {
            const element = document.querySelector(selector);
            return element && !element.classList.contains('show-button');
        }, {}, expandContainerSelector)
        .then(() => console.log("Click successful! 'show-button' class removed."))
        .catch(() => console.log("Click might have failed or class didn't change."));
    } else {
        console.log("Button not found.");
    }

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
            await new Promise(r => setTimeout(r, 500)); // Adjust this as needed for content load time
        
            // Get the new height of the .collection-grid element after scrolling
            currentHeight = await page.evaluate(() => {
            const grid = document.querySelector('.collection-grid');
            return grid ? grid.scrollHeight : 0;
            });
        }
    };

    await scrollToBottom()

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

  let allCollections = []
  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to 'false' if you want to see the browser interact
  });

  const page = await browser.newPage(); // Create a new page

  // Go to the Bandcamp page (replace with your URL of choice)
  await page.goto('https://auratribale.bandcamp.com/track/seeing-the-end-original-mix', { waitUntil: 'domcontentloaded' });

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

  for (const fan of fansData) {
    const data = await scrapeFanCollection(fan);
    allCollections.push(data)
  }

  console.log(fansData);
})();