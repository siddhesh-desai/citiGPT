const express = require("express");

const router = express.Router();

const chatController = require("../controllers/chat");

router.post('/botresponse', chatController.getChatResponse);

module.exports = router;
