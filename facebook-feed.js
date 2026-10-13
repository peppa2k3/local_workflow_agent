// Run: npm install playwright && node facebook-feed.js
const { chromium } = require('playwright');
// The User Data directory is the parent of the Chrome profile directory.
const chromeUserDataDir = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data';
const profileDirectory = 'Profile 2';
const reelsUrl = 'https://www.facebook.com/profile.php?id=61583720522404';

async function main() {
  const context = await chromium.launchPersistentContext(chromeUserDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [`--profile-directory=${profileDirectory}`, '--start-maximized'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(reelsUrl, { waitUntil: 'domcontentloaded' });

  console.log(`Chrome ${profileDirectory} opened the Reels tab. Press Enter to start scrolling.`);
  await new Promise(resolve => process.stdin.once('data', resolve));

  for (let i = 0; i < 30 && !page.isClosed(); i++) {
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(2500);
  }

  console.log('Done. Press Ctrl+C to exit.');
  await new Promise(() => {});
}

main().catch(error => {
  if (String(error.message).includes('Opening in existing browser session')) {
    console.error('Chrome is already running with this User Data directory. Close every Chrome window and background Chrome process, then retry.');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
