// ==UserScript==
// @name        portofilio helper
// @namespace   Violentmonkey Scripts
// @match       https://my.wealthsimple.com/app/trade/accounts/*
// @grant       none
// @version     1.0
// @author      -
// @description 1/15/2022, 11:30:56 AM
// ==/UserScript==
const targetProportions = {
  VAB: 0.1,
  XAW: 0.3,
  ZCN: 0.6,
};

function log(...msg) {
  console.log("PortfolioHelper: ", ...msg);
}

class Security {
  constructor(ticker, domContainer, targetProportion) {
    this.ticker = ticker;
    this.domContainer = domContainer;
    this.targetProportion = targetProportion;
    const { price, totalValue } = getPriceAndTotalValueFromContainer(
      domContainer
    );
    this.price = price;
    this.totalValue = totalValue;
    this.numOfSharesElm = getNumberOfSharesDomElm(domContainer);
  }

  getProportionOfPortfolio(totalPortfolioValue) {
    return this.totalValue / totalPortfolioValue;
  }

  addProportionOfPortfolioToDOM(totalPortfolioValue) {
    addToNumOfSharesElmText(
      `\n${(this.getProportionOfPortfolio(totalPortfolioValue) * 100).toFixed(
        2
      )}%`,
      this.numOfSharesElm
    );
  }

  getDifferenceOfTargetProportionToActualProportion(totalPortfolioValue) {
    return (
      this.getProportionOfPortfolio(totalPortfolioValue) - this.targetProportion
    );
  }

  addSharesToBuyToDom(numOfSharesToBuy) {
    addToNumOfSharesElmText(`\nBuy ${numOfSharesToBuy}`, this.numOfSharesElm);
  }
}

function findAncestor(el, sel) {
  while (
    (el = el.parentElement) &&
    !(el.matches || el.matchesSelector).call(el, sel)
  );
  return el;
}

async function waitForPageLoaded() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (document.querySelector('[data-qa="wstrade-position-list"]')) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

function getSecurityDomContainers() {
  const positionListElm = document
    .querySelector('[data-qa="wstrade-position-list"]')
    .querySelectorAll("span");
  let vabCtnBtn, xawCtnBtn, zcnCtnBtn;

  positionListElm.forEach((elm) => {
    if (elm.innerText === "VAB") vabCtnBtn = findAncestor(elm, "button");
    if (elm.innerText === "XAW") xawCtnBtn = findAncestor(elm, "button");
    if (elm.innerText === "ZCN") zcnCtnBtn = findAncestor(elm, "button");
  });

  return { vabCtnBtn, xawCtnBtn, zcnCtnBtn };
}

function extractDollarNumberInCentsFromText(text) {
  return Number(
    text
      .substring(1)
      .replace(",", "")
      .replace(".", "")
  );
}

function getPriceAndTotalValueFromContainer(ctn) {
  // Find all dollar figures in this container.
  // The first is price, second is total value
  const dollarFiguresText = [];

  ctn.querySelectorAll("span").forEach((elm) => {
    if (elm.innerText.startsWith("$")) dollarFiguresText.push(elm.innerText);
  });

  const price = extractDollarNumberInCentsFromText(dollarFiguresText[0]);
  const totalValue = extractDollarNumberInCentsFromText(dollarFiguresText[1]);

  return { price, totalValue };
}

function addToNumOfSharesElmText(textToAdd, numOfSharesElm) {
  numOfSharesElm.innerText += textToAdd;
}

function getNumberOfSharesDomElm(ctn) {
  let numOfSharesElm;

  ctn.querySelectorAll("p").forEach((elm) => {
    if (elm.innerText.endsWith("shares")) numOfSharesElm = elm;
  });

  return numOfSharesElm;
}

function getTotalPortfolioValue(securities) {
  return securities.reduce((acc, sec) => acc + sec.totalValue, 0);
}

function calculateNumberOfSharesThatCanBeBoughtWithSoMuch$(budget, securities) {
  return securities.reduce((acc, sec) => {
    const budget = budget * sec.targetProportion;
    return {
      ...acc,
      [sec.ticker]: Math.floor(budget / sec.price),
    };
  }, {});
}

function calculateNumberOfSharesOfEachSecurityNeededToBuyToRebalanceWithoutSelling(
  securities
) {
  const [highestProportionalSecurity, ...restOfSecurities] = securities;
  const totalValueOfPortfolioAfterRebalanceWithOnlyBuys =
    (highestProportionalSecurity.totalValue /
      (highestProportionalSecurity.targetProportion * 100)) *
    100;

  log(
    "totalValueOfPortfolioAfterRebalanceWithOnlyBuys",
    totalValueOfPortfolioAfterRebalanceWithOnlyBuys
  );

  return restOfSecurities.reduce(
    (acc, sec) => {
      const budget =
        totalValueOfPortfolioAfterRebalanceWithOnlyBuys * sec.targetProportion -
        sec.totalValue;
      return {
        ...acc,
        [sec.ticker]: Math.floor(budget / sec.price),
      };
    },
    {
      [highestProportionalSecurity.ticker]: 0,
    }
  );
}

function calculateCostToRebalanceWithoutSelling(
  numberOfSharesToBuyOfEachSecToBalance,
  securities
) {
  return securities.reduce((acc, sec) => {
    return acc + numberOfSharesToBuyOfEachSecToBalance[sec.ticker] * sec.price;
  }, 0);
}

function getAvailableCash() {
  let availableCash;

  document
    .querySelector('[data-qa="wstrade-account-funds-card"]')
    .querySelectorAll("p")
    .forEach((elm) => {
      if (elm.innerHTML.startsWith("$")) {
        availableCash = extractDollarNumberInCentsFromText(elm.innerHTML);
      }
    });

  return availableCash;
}

function calculateSuggestedNumberOfSharesToBuyToStayBalanced(
  budget,
  securities
) {
  return securities.reduce((acc, sec) => {
    const budgetForSecurity = budget * sec.targetProportion;
    return {
      ...acc,
      [sec.ticker]: Math.floor(budgetForSecurity / sec.price),
    };
  }, {});
}

async function run() {
  try {
    log("starting");

    await waitForPageLoaded();

    const { vabCtnBtn, xawCtnBtn, zcnCtnBtn } = getSecurityDomContainers();

    const securities = [
      new Security("VAB", vabCtnBtn, targetProportions.VAB),
      new Security("XAW", xawCtnBtn, targetProportions.XAW),
      new Security("ZCN", zcnCtnBtn, targetProportions.ZCN),
    ];

    const totalPortfolioValue = getTotalPortfolioValue(securities);

    securities.forEach((sec) =>
      sec.addProportionOfPortfolioToDOM(totalPortfolioValue)
    );

    securities.sort(
      (a, b) =>
        a.getDifferenceOfTargetProportionToActualProportion(
          totalPortfolioValue
        ) -
        b.getDifferenceOfTargetProportionToActualProportion(totalPortfolioValue)
    );

    // Security that is proportionally highest above its target is first
    securities.reverse();

    const numberOfSharesToBuyOfEachSecToBalance = calculateNumberOfSharesOfEachSecurityNeededToBuyToRebalanceWithoutSelling(
      securities
    );

    const costToRebalanceWithoutSelling = calculateCostToRebalanceWithoutSelling(
      numberOfSharesToBuyOfEachSecToBalance,
      securities
    );

    log("how much to buy of everything", numberOfSharesToBuyOfEachSecToBalance);
    log("how much that will cost", costToRebalanceWithoutSelling / 100);

    const availableCash = getAvailableCash();

    if (availableCash < costToRebalanceWithoutSelling) {
      log(
        `We need $${(costToRebalanceWithoutSelling - availableCash) /
          100} more to rebalance`
      );
      //TODO
      // sharesToBuy = calculateSuggestedNumberOfSharesToBuyForPartialRebalance();
    } else {
      const sharesToBuyAfterBalancing = calculateSuggestedNumberOfSharesToBuyToStayBalanced(
        availableCash - costToRebalanceWithoutSelling,
        securities
      );

      log("to buy after blaancing", sharesToBuyAfterBalancing);

      const totalSharesToBuy = securities.reduce((acc, sec) => {
        return {
          ...acc,
          [sec.ticker]:
            numberOfSharesToBuyOfEachSecToBalance[sec.ticker] +
            sharesToBuyAfterBalancing[sec.ticker],
        };
      }, {});

      securities.forEach((sec) => {
        sec.addSharesToBuyToDom(totalSharesToBuy[sec.ticker]);
      });
    }
  } catch (e) {
    log("error", e);
  }
}

run();
