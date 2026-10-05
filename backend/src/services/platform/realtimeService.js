class RealtimeService {
  constructor() {
    this.io = null;
  }

  attach(io) {
    this.io = io;
  }

  roomForUser(userId) {
    return `user:${userId}`;
  }

  emitToUser(userId, event, payload) {
    if (!this.io) {
      return;
    }
    this.io.to(this.roomForUser(userId)).emit(event, payload);
  }
}

module.exports = RealtimeService;