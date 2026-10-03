const asyncHandler = require("../../utils/asyncHandler.js");

class SearchController {
  constructor(searchService) {
    this.searchService = searchService;
  }

  search = asyncHandler(async (req, res) => {
    const data = await this.searchService.search(req.user.userId, req.query.q);

    return res.status(200).json({ success: true, data });
  });
}

module.exports = SearchController;