const mongoose = require("mongoose");

const balcklistTokenSchema = new mongoose.Schema({
    token :{
        type : String,
        required : [ true, "token is required to be added in blacklist"],
        index : true,
    },
    // When the token itself expires; MongoDB's TTL monitor deletes the entry after that.
    expiresAt : {
        type : Date,
        expires : 0,
    },
},{
    timestamps : true
})

const tokenBlacklistModel = mongoose.model("blacklistTokens" , balcklistTokenSchema);

module.exports = tokenBlacklistModel ;
