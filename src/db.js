const fs = require("fs");
const path = require("path");

const PRODUCTS_PATH = path.join(__dirname, "..", "data", "products.json");
const ORDERS_PATH = path.join(__dirname, "..", "data", "orders.json");
const AFFILIATES_PATH = path.join(__dirname, "..", "data", "affiliates.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = {
  getProducts: () => readJson(PRODUCTS_PATH),
  getOrders: () => readJson(ORDERS_PATH),
  saveOrders: (orders) => writeJson(ORDERS_PATH, orders),
  getAffiliates: () => readJson(AFFILIATES_PATH),
  saveAffiliates: (affiliates) => writeJson(AFFILIATES_PATH, affiliates),
};
