'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, enum: ['admin', 'annotator'], required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    username: this.username,
    displayName: this.displayName,
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
