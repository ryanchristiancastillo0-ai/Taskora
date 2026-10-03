const bcrypt = require("bcrypt");

class PasswordService {
  constructor() {
    this.saltRounds = 12;
  }

  async hash(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  async compare(password, passwordHash) {
    return await bcrypt.compare(password, passwordHash);
  }
}

module.exports = PasswordService;