const { Builder, By, Key, until, WebElement } = require('selenium-webdriver');

async function extractName(item) {
  return await item
    .findElements(By.css('h3'))
    .getText()
    .catch((err) => console.log(err));
}

(async function scrap() {
  let driver = await new Builder().forBrowser('chrome').build();
  try {
    const doctors = [];
    await driver.get('https://www.doctoralia.com.br/pesquisa?q=&loc=S%C3%A3o%20Paulo');
    const list = await (await driver.findElement(By.className('search-list'))).findElements(By.css('li'));
    const filteredList = [];
    for (const item of list) {
      const hasDoctorInside = (await (await item.findElements(By.className('panel'))).length) > 0;
      if (hasDoctorInside) {
        filteredList.push(item);
      }
    }

    for (const item of filteredList) {
      const doctor = {};
      doctor.name = await (await item.findElements(By.css('h3')))[0].getText();
      const doctorSummaryElm = (await item.findElements(By.css('h4')))[0];
      const summarySpans = await doctorSummaryElm.findElements(By.css('span'));
      const doctorSummary = (await summarySpans[0].getText()) + (await summarySpans[2].getAttribute('textContent'));
      doctor.expertise = doctorSummary.substr(0, doctorSummary.indexOf('(') - 1).trim();
      doctor.bio = doctorSummary.substr(doctorSummary.indexOf('(')).replace('(', '').replace(')', '').trim();
      const offersTelemedicineP = (await item.findElements(By.className('m-0 pl-1 text-nowrap')))[0];
      doctor.telemedicine = (offersTelemedicineP && (await offersTelemedicineP.getText()) === 'Oferece telemedicina') || false;

      const rating = await (await item.findElements(By.className('rating')))[0].getAttribute('data-score');
      doctor.rating = rating;
      doctors.push(doctor);
    }
    console.log(doctors);
  } finally {
    await driver.quit();
  }
})();
