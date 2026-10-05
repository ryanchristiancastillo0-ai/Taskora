const express = require("express");

const { prisma } = require("../../config/container.js");

const SearchService = require("../../services/search/searchService.js");
const SearchController = require("../../controllers/search/searchController.js");
const authMiddleware = require("../../middleware/authMiddleware.js");

const router = express.Router();

const searchController = new SearchController(new SearchService(prisma));

router.get("/", authMiddleware, searchController.search);

module.exports = router;