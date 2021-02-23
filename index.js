const { Builder, By, until } = require('selenium-webdriver');
const fs = require('fs');

function getDoctorsPageUrl(index) {
  return `https://www.doctoralia.com.br/pesquisa?q=&loc=S%C3%A3o+Paulo&page=${index}`;
  // return `https://www.doctoralia.com.br/pesquisa?q=&loc=Porto+Alegre%2C+RS&page=${index}`;
}

(async function () {
  let pageIndex = 190;
  const driver = await new Builder().forBrowser('chrome').build();
  async function getDoctorsList() {
    const list = await (await driver.findElement(By.className('search-list'))).findElements(By.css('li'));
    const filteredList = [];
    for (const item of list) {
      const hasDoctorInside = (await (await item.findElements(By.className('panel'))).length) > 0;
      if (hasDoctorInside) {
        filteredList.push({ element: item });
      }
    }

    return filteredList;
  }

  async function extractName() {
    return await (await driver.findElements(By.className('unified-doctor-header-info__name')))[0].getText();
  }

  async function extractAddress(doctor) {
    let addressNavButtons = [];
    const tabsButtonsDivs = await driver.findElements(By.className('btn-group'));
    if (tabsButtonsDivs && tabsButtonsDivs.length) {
      addressNavButtons = await tabsButtonsDivs[0].findElements(By.css('a'));
    }
    const addressPanels = await driver.findElements(By.className('tab-pane'));
    let addressesObjs = [];
    let panelIndex = 0;
    for (const panel of addressPanels) {
      const addressObj = {};
      const addressH5 = (await panel.findElements(By.css('h5')))[0];
      if (addressH5) {
        const addressRawElements = await addressH5.findElements(By.className('text-base-color'));
        if (addressRawElements && addressRawElements.length) {
          const addressParts = await addressRawElements[0].findElements(By.css('*'));
          addressObj.address = addressParts[0] ? (await addressParts[0].getAttribute('textContent')).trim() : null;
          addressObj.city = addressParts[1] ? (await addressParts[1].getAttribute('textContent')).trim() : null;
          addressObj.state = addressParts[2] ? (await addressParts[2].getAttribute('textContent')).trim() : null;

          if (addressNavButtons.length) {
            try {
              await addressNavButtons[panelIndex].click();
              await driver.sleep(500);
            } catch (e) {}
            panelIndex++;
          }

          const panelAnchors = await panel.findElements(By.css('a'));
          for (const anchor of panelAnchors) {
            if ((await anchor.getAttribute('data-id')) === 'show-phone-number-modal') {
              await anchor.click().catch((e) => {});
              await driver.sleep(500);
              const numberContainer = (await driver.findElements(By.className('well')))[0];
              if (numberContainer) {
                const numberAnchor = (await numberContainer.findElements(By.css('a')))[0];
                if (numberAnchor) {
                  addressObj.phone = await numberAnchor.getText();
                }

                await driver.sleep(500);
                const closeButtons = await driver.findElements(By.className('close'));
                for (const button of closeButtons) {
                  try {
                    await button.click().catch((e) => {});
                  } catch (e) {}
                }
                await driver.sleep(500);
                break;
              }
            }
          }
        } else {
          if (
            addressNavButtons[panelIndex] &&
            (await addressNavButtons[panelIndex].getText()).trim() === 'Telemedicina'
          ) {
            panelIndex++;
            doctor.offersTelemedicine = true;
          }
        }
      }
      if (Object.keys(addressObj).length) {
        addressesObjs.push(addressObj);
      }
    }
    addressesObjs = addressesObjs.filter((value, index, self) => {
      return (
        self.findIndex(
          (item) => item.address === value.address && item.city === value.city && item.state === value.state
        ) === index
      );
    });
    addressesObjs.forEach((adr, adrIndex) => {
      doctor[`address${adrIndex + 1}`] = adr;
    });
  }

  async function extractExpertiseAndExperiencies(doctor) {
    const h2Elements = await driver.findElements(By.css('h2'));
    let infoLinksH2;
    for (const h2 of h2Elements) {
      if ((await h2.getAttribute('data-test-id')) === 'doctor-specializations') {
        infoLinksH2 = h2;
      }
    }

    const spanElements = await infoLinksH2.findElements(By.css('span'));
    for (const span of spanElements) {
      if ((await span.getAttribute('data-id')) === 'doctor-specializations-info-vue') {
        (await span.findElements(By.css('a')))[0].click();
        await driver.sleep(500);
        const modals = await driver.findElements(By.className('modal-content'));
        let detailsModal;
        for (const modal of modals) {
          if ((await modal.getText()).includes('Mais detalhes')) {
            detailsModal = modal;
          }
        }
        const modalItems = await detailsModal.findElements(By.className('display-flex'));
        for (const modalItem of modalItems) {
          const icon = (await modalItem.findElements(By.css('i')))[0];
          const iconClass = await icon.getAttribute('class');
          const textDiv = (await modalItem.findElements(By.css('div')))[0];
          const text = await (await textDiv.findElements(By.css('*')))[1].getText();
          if (iconClass.includes('svg-icon__sthetoscope')) {
            doctor.expertise = text;
          } else if (iconClass.includes('svg-icon__three-stars')) {
            doctor.experiences = text.split('\n');
          }
        }

        (await detailsModal.findElements(By.className('btn')))[0].click();
      }
    }
  }

  async function extractRating(doctor) {
    const rating = (await driver.findElements(By.className('rating')))[0];
    if (rating) {
      doctor.rating = await rating.getAttribute('data-score');
    }
  }

  async function extractBio(doctor) {
    const doctorItems = (await driver.findElements(By.className('doctor-items')))[0];
    if (doctorItems) {
      const anchors = await doctorItems.findElements(By.css('a'));

      for (const anchor of anchors) {
        if ((await anchor.getAttribute('data-target')) === '#data-type-about') {
          await anchor.click();
          await driver.sleep(500);
          const modal = await driver.findElement(By.id('data-type-about'));
          const pElement = (await modal.findElements(By.css('p')))[0];
          doctor.bio = (await pElement.getText()).split('\n').join(' ');
        }
      }
    }
  }

  try {
    const doctors = [];
    await driver.get(getDoctorsPageUrl(pageIndex));

    while ((await driver.getCurrentUrl()) === getDoctorsPageUrl(pageIndex)) {
      const pageDoctorList = await getDoctorsList();

      for (const pageDoctor of pageDoctorList) {
        const anchors = await pageDoctor.element.findElements(By.css('a'));
        for (const anchor of anchors) {
          if ((await anchor.getAttribute('data-id')) === 'address-context-cta') {
            pageDoctor.url = await anchor.getAttribute('href');
          }
        }
      }

      for (const pageDoctor of pageDoctorList) {
        const doctor = { offersTelemedicine: false };
        await driver.navigate().to(pageDoctor.url);
        await driver.wait(until.elementLocated(By.id('profile-info'), 5000));

        doctor.name = await extractName();
        await extractAddress(doctor);
        await extractExpertiseAndExperiencies(doctor);
        await extractRating(doctor);
        await extractBio(doctor);

        doctors.push(doctor);
      }

      fs.writeFileSync(`Sao-paulo-page-${pageIndex}.json`, JSON.stringify(doctors, null, 2));
      // fs.writeFileSync(`Porto-alegre-page-${pageIndex}.json`, JSON.stringify(doctors, null, 2));
      pageIndex++;
      await driver.get(getDoctorsPageUrl(pageIndex));
    }

    console.log(doctors);
  } finally {
    // await driver.quit();
  }
})();
