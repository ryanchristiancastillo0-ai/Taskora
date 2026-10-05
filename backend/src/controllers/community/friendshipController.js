const asyncHandler = require("../../utils/asyncHandler.js");

class FriendshipController {
  constructor(friendshipService) {
    this.friendshipService = friendshipService;
  }

  listFriends = asyncHandler(async (req, res) => {
    const data = await this.friendshipService.listFriends(
      req.user.userId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  search = asyncHandler(async (req, res) => {
    const data = await this.friendshipService.searchUsers(
      req.user.userId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  listRequests = asyncHandler(async (req, res) => {
    const data = await this.friendshipService.listRequests(
      req.user.userId,
      req.query
    );

    return res.status(200).json({ success: true, data });
  });

  send = asyncHandler(async (req, res) => {
    const request = await this.friendshipService.send(
      req.user.userId,
      req.body.receiverId
    );

    return res.status(201).json({ success: true, data: { request } });
  });

  respond = asyncHandler(async (req, res) => {
    const result = await this.friendshipService.respond(
      req.user.userId,
      req.params.id,
      req.body.action
    );

    return res.status(200).json({ success: true, data: result });
  });

  cancel = asyncHandler(async (req, res) => {
    const result = await this.friendshipService.cancel(
      req.user.userId,
      req.params.id
    );

    return res.status(200).json({ success: true, data: result });
  });

  removeFriend = asyncHandler(async (req, res) => {
    const result = await this.friendshipService.removeFriend(
      req.user.userId,
      req.params.userId
    );

    return res.status(200).json({ success: true, data: result });
  });
}

module.exports = FriendshipController;