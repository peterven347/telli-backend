require('dotenv').config()
const bcryptjs = require("bcryptjs")
const express = require("express")
const fadmin = require('firebase-admin')
const fs = require("fs")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")
const multer = require("multer")
const nodemailer = require("nodemailer")
const os = require("os")
const path = require("path")

const { io } = require("../socket")
const Domain = require("../models/domain.model")
const Issue = require("../models/issue.model")
const RefreshToken = require("../models/refresh_token.model")
const Sector = require('../models/sector.model')
const User = require("../models/user.model")
const serviceAccount = require("../serviceAccountKey.json")
const { country_dial_codes } = require("../utils/country-dial-codes")
const router = express.Router()
const { auth, refreshAuth, socketAuth } = require("../middlewares/auth")
fadmin.initializeApp({ credential: fadmin.credential.cert(serviceAccount) })

const url_domain = `http://${getLocalIPAddress()}:3030`
let pending_emails = [];
let refresh_tokens_array = [];
let generated_codes = [];

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dynamicDest = req.path.includes("/domain") ? "files/domainImg" : req.path.includes("/issue") ? "files/issuesImg" : "files";
        if (!fs.existsSync(dynamicDest)) {
            fs.mkdirSync(dynamicDest, { recursive: true });
        }
        cb(null, dynamicDest);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now().toString() + '-' + file.originalname)
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "image/jpg" || file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
        cb(null, true)
    } else {
        cb(null, false)
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// (async () => {
//     await Domain.syncIndexes()
//     const result = await RefreshToken.find({})  use redis instead
//     refresh_tokens_array = result
// })();

const now = (new Date()).toLocaleTimeString();

const isId = i => {
    if (mongoose.Types.ObjectId.isValid(i)) return true
    return false
}
const isNumeric = i => /^\+?\d+$/.test(i)
// first_name
// last_name
// domainName
// title
const isName = i => /^/.test(i)
// email
const isEmail = i => /^(?=.{1,256}$)(?=.{1,64}@.{1,255}$)(?=[^@]+@[^@]+\.[a-zA-Z]{2,63}$)^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(i)
//status
const isStatus = i => /^public$|^private$/.test(i)
//code
const isCode = i => /^/.test(i)
//phone_number
const isPhoneNum = i => /^/.test(i)
//note
const isNote = i => /^/.test(i)
//delegate
const isDelegate = i => /^/.test(i) //string

async function getDelegates(delegates, id) {
    const _delegates = delegates.split(",")
    let delegateList = []
    let delegateFcmToken = []
    for (i of _delegates) {
        const temp = isNumeric(i) ? await User.findOne({ phone_number: cleanPhoneNumber(i) }) : await User.findOne({ email: i })
        if (temp !== null && temp.id !== id) {
            delegateList.push(temp.id)
            delegateFcmToken = delegateFcmToken.concat(temp.fcmTokens)
        }
    }
    return ({ delegateList: delegateList, delegateFcmToken: delegateFcmToken })
};

function cleanPhoneNumber(input) {
    const number = input.trim().replace(/\D/g, '');
    for (const i of country_dial_codes) {
        if (number.startsWith(i)) {
            return number.replace(i, '');
        }
    }
    if (number.startsWith("0")) {
        return number.slice(1);
    }
    return number;
};

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function regexQuery(string) {
    const escapeRegex = string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex chars
    return new RegExp(escapeRegex, 'i');
}

const userNameSpace = io.of("/api/user")
userNameSpace.use(socketAuth)
userNameSpace.on("connection", async (socket) => {
    const user = await User.findOne({ email: socket.auth }).select("_id sectors")
    if (!user) return socket.disconnect()
    const sectors = await Sector.find({ $or: [{ _id: { $in: user.sectors } }, { creator_id: user._id }] }).select("_id")

    socket.on("joinSectors", () => {
        sectors.map(i => i.id).forEach(id => { socket.join(id) });//console.log("joined", id)
    })
    socket.on("disconnect", () => console.log("client cut off"))

    const count = io.engine.clientsCount;
    const count2 = io.of(userNameSpace).sockets.size;
    console.log((new Date()).toLocaleTimeString(), count, count2)
})

//GET
// console.log(req.get("user-agent"))
router.get("/test", async (req, res) => {
    try {
        userNameSpace.emit("test")
        userNameSpace.emit("test1")
        res.send(getLocalIPAddress())
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).send({ success: false, err });
    }
});

router.get("/verify-email", (req, res) => {
    const token = req.query.token
    if (!token) return res.status(400).json({ message: "invalid" })
    try {
        jwt.verify(token, process.env.EMAIL_VERI_KEY, (err, _user) => {
            if (err) {
                res.send("an error occured")
            } else {
                let email = _user.email
                let user = pending_emails.find(i => i.email === email)
                if (user) {
                    user = user.property
                    user.save()
                        .then(pending_emails = pending_emails.filter(i => i.email !== email))
                        .then(res.send("Your email has been verified!, go back and login"))
                } else {
                    const saved = User.findOne({ email: _user.email })
                    if (saved) {
                        res.send("Your email has already been verified!, go back and login")
                    } else {
                        res.send("Please complete sign up click here")
                    }
                }
            }
        })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.get("/domain", auth, async (req, res) => {
    console.log(req.get("user-agent"))
    try {
        const user = await User.findOne({ email: req.auth.email }).select("-fcmTokens")
        if (user === null) return res.json({ success: false })

        const sectors = await Sector.find({ $or: [{ _id: { $in: user.sectors } }, { creator_id: user._id }] }).sort({ _id: -1 })
        const domainId = [...new Set(sectors.map(i => i.domain_id.toString()))]
        const domain = await Domain.aggregate([
            {
                $match: {
                    _id: { $in: domainId.map(id => new mongoose.Types.ObjectId(id)) }
                }
            },
            {
                $lookup: {
                    from: 'sectors',
                    localField: '_id',
                    foreignField: 'domain_id',
                    as: 'sectors',
                }
            },
            {
                $addFields: {
                    sectors: {
                        $filter: {
                            input: '$sectors',
                            as: 'sector',
                            cond: {
                                $or: [
                                    { $in: ['$$sector._id', user.sectors] },
                                    { $eq: ['$$sector.creator_id', user._id] }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $set: {
                    sectors: {
                        $sortArray: {
                            input: '$sectors',
                            sortBy: { _id: -1 }
                        }
                    }
                }
            },
            {
                $set: {
                    'sectors.data': []
                }
            },
        ]).sort({ _id: -1 });
        res.json({ success: true, domain: domain })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.get("/domain/:sectorId", auth, async (req, res) => {
    try {
        const sectorId = req.params.sectorId
        const user = await User.findOne({ email: req.auth.email }).select("-fcmTokens")
        if (user === null) return res.json({ success: false })

        const sectors = await Sector.findOne({
            $and: [{ _id: sectorId }, { _id: { $nin: user.sectors }, status: "public" }]
        })
        const domain = await Domain.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(sectors?.domain_id)
                }
            },
            {
                $lookup: {
                    from: 'sectors',
                    localField: '_id',
                    foreignField: 'domain_id',
                    as: 'sectors',
                }
            },
            {
                $addFields: {
                    sectors: {
                        $filter: {
                            input: '$sectors',
                            as: 'sector',
                            cond: {
                                $and: [
                                    // { $in: ['$$sector._id', user.sectors] }, uncomment, needed
                                    { $eq: ['$$sector._id', new mongoose.Types.ObjectId(sectorId)] }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $unwind: '$sectors'
            },
            {
                $lookup: {
                    from: 'issues',
                    localField: 'sectors._id',
                    foreignField: 'sector_id',
                    as: 'sectorIssues'
                }
            },
            {
                $set: {
                    'time': Date.now(),
                    'sectors.data': { $reverseArray: '$sectorIssues' }
                }
            },
            {
                $unset: 'sectorIssues'
            }
        ]);
        res.json({ success: true, data: domain })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.get("/domain", auth, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.auth.email }).select("-fcmTokens")
        if (user === null) return res.json({ success: false })

        const sectors = await Sector.find({ $or: [{ _id: { $in: user.sectors } }, { creator_id: user._id }] })
        const domainId = [...new Set(sectors.map(i => i.domain_id.toString()))]
        const domain = await Domain.aggregate([
            {
                $match: {
                    _id: { $in: domainId.map(id => new mongoose.Types.ObjectId(id)) }
                }
            },
            {
                $lookup: {
                    from: 'sectors',
                    localField: '_id', //sector or sectors ._id
                    foreignField: 'domain_id',
                    as: 'sectors',
                }
            },
            {
                $addFields: {
                    sectors: {
                        $filter: {
                            input: '$sectors',
                            as: 'sector',
                            cond: {
                                $or: [
                                    { $in: ['$$sector._id', user.sectors] },
                                    { $eq: ['$$sector.creator_id', user._id] }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $unwind: '$sectors'
            },
            {
                $lookup: {
                    from: 'issues',
                    localField: 'sectors._id', //not _id?? 
                    foreignField: 'sector_id',
                    as: 'sectors.data'
                }
            },
            {
                $set: {
                    'sectors.data': { $reverseArray: '$sectors.data' }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    mergedFields: { $mergeObjects: '$$ROOT' },
                    sectors: { $push: '$sectors' }
                }
            },
            {
                $replaceRoot: {
                    newRoot: {
                        $mergeObjects: ['$mergedFields', { sectors: '$sectors' }]
                    }
                }
            }
        ]);
        res.json({ success: true, domain: domain })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.get("/sector", auth, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.auth.email }).select("sectors")
        const query = req.query.q
        if (!query) { console.log("no query") }
        const tempSectors = await Sector.find({
            $and: [
                { _id: { $nin: user.sectors } },
                { creator_id: { $ne: user._id } },
                { status: "public" },
                { title: { $regex: regexQuery(query) } }
            ]
        }).limit(20).lean()
        const domainIds = [...new Set(tempSectors.map(sector => sector.domain_id))]
        const domains = await Domain.find({ _id: { $in: domainIds } }).select("domain logo")
        const sectors = tempSectors.map(i => ({ ...i, logo: domains.find(j => j._id.equals(i.domain_id))?.logo ?? "" }))
        res.json({ success: true, data: sectors })
    } catch (err) {
        console.log(err)
    }
});

router.get("/issues-voted", auth, async (req, res) => {
    try {
        const issues_voted = await User.findOne({ email: req.auth.email }).select("issues_voted -_id")
        if (!issues_voted) return res.json({ success: false, message: "no user found" })
        res.json({ success: true, issues_voted: issues_voted.issues_voted })
    } catch (err) {
        console.log(err)
        res.json({ success: false, message: "an error occured" })
    }
});

router.get("/issue/:sectorId/:skip", auth, async (req, res) => {
    try {
        const { sectorId, skip } = req.params
        const user = await User.findOne({ email: req.auth.email }).select("sectors")
        if (user === null) return res.json({ success: false })
        const issue = (await Issue.find({
            $and: [{
                $or: [
                    { sector_id: { $in: user.sectors } },
                    { creator_id: user._id }
                ]
            }, { sector_id: sectorId }]
        }).sort({ _id: -1 }).skip(skip)
        )
        res.json({ success: true, data: issue })
    } catch (err) {

    }
})

//POST
router.post("/sign-up", (req, res) => {
    const { first_name, last_name, email, phone_number, password } = req.body
    if (!first_name || !last_name || !isEmail(email) || !phone_number || !password) {
        return res.status(400).json({ success: false, message: "incomplete data" })
    }
    try {
        User.findOne({ email: email })
            .then(result => {
                if (result) {
                    res.json({ message: "email already exists" })
                } else {
                    bcryptjs.hash(password, 10)
                        .then(hashedPassword => {
                            const user = new User({
                                first_name: first_name,
                                last_name: last_name,
                                email: email,
                                phone_number: phone_number,
                                password: hashedPassword
                            })
                            const emailIndex = pending_emails.findIndex(i => i.email === email)
                            if (emailIndex === -1) {
                                pending_emails.push({ email: email, property: user })
                            } else {
                                pending_emails[emailIndex] = { email: email, property: user }
                            }
                        })
                    const token = jwt.sign(
                        {
                            email: email,
                            userAgent: req.get("user-agent")
                        },
                        process.env.EMAIL_VERI_KEY,
                        { expiresIn: "15m" }
                    )

                    const mailOptions = {
                        from: "Telli <peterolanrewaju22@gmail.com>",
                        to: email,
                        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
                        subject: "Verify your mail",
                        html: `<p>Welcome! <a href="${url_domain}/api/user/verify-email?token=${token}">click to verify<a/></p>`
                    }
                    transporter.sendMail(mailOptions, (err, info) => {
                        if (err) {
                            return res.status(400).json({ message: "an error occured, check that your details are complete" })
                        }
                        res.status(200).json({ message: "A verification link has been sent to", resMail: email })
                    })
                }
            })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }

});

router.post("/login", async (req, res) => {
    const { email, password, fcmToken } = req.body
    if (!isEmail(email) || !password || !fcmToken) {
        return res.status(400).json({ success: false, message: "incomplete data" })
    }
    const mailOptions = {
        from: "resource-pro <peterolanrewaju22@gmail.com>",
        to: email,
        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
        subject: "Login detected",
        html: `<p>Take action if this wasnt you</p>`
    }
    try {
        User.findOne({ email: email })
            .then(user => {
                if (user === null) {
                    res.json({ message: "email does not exist" }) //
                } else {
                    bcryptjs.compare(password, user.password, (err, data) => {
                        if (err) {
                            return res.json({ message: "Incorrect password" })
                        }
                        if (data) {
                            const accessToken = jwt.sign(
                                {
                                    email: user.email,
                                    first_name: user.first_name
                                },
                                process.env.ACCESS_TOKEN_SECRET,
                                { expiresIn: "50m" }
                            )
                            const refreshToken = jwt.sign(
                                {
                                    email: user.email,
                                    device: req.headers['user-agent']
                                },
                                process.env.REFRESH_TOKEN_SECRET,
                                { expiresIn: "8h" }
                            )
                            const refresh_token = new RefreshToken({
                                email: email,
                                refreshToken: refreshToken
                            })
                            const userObject = user.toObject()
                            delete userObject.password
                            delete userObject.fcmTokens

                            refresh_token.save()
                                .then(refresh_tokens_array.push({ email: email, refreshToken: refreshToken }))
                                .then(
                                    res
                                        // .cookie("refreshToken", refreshToken, { httpOnly: true, secure: true, sameSite: "Strict"}) // for web app //strict??
                                        // .header("Authorization", accessToken) // for web app
                                        .json({ success: true, accessToken: accessToken, refreshToken: refreshToken, user: userObject }) // for mobile apps
                                )
                            // .then(
                            //     transporter.sendMail(mailOptions, (err, info) => {
                            //         if (true) return res.status(400).json({ message: err.message })
                            //     })
                            // )
                            if (!user.fcmTokens.includes(fcmToken)) {
                                user.fcmTokens.push(fcmToken)
                            }
                            let tokens = user.fcmTokens.filter(i => i !== fcmToken)
                            // console.log(tokens)
                            const message = {
                                tokens: tokens,
                                notification: {
                                    title: "Login detected",
                                    body: "Your account has been logged in on another device",
                                },
                            }
                            user.save()
                            // .then(tokens.length >= 1 && fadmin.messaging().sendEachForMulticast(message))
                        } else {
                            console.log(4)
                            res.json({ success: false, message: "wrong password!" })
                        }
                    })
                }
            })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.post("/reset-code", async (req, res) => {
    const { email, password, newPassword } = req.body
    if (!isEmail(email) || !password || !newPassword) {
        return res.status(400).json({ success: false, message: "incomplete data" })
    }
    const generate_code = (min, max) => {
        let code = "";
        const get_digit = Math.floor(Math.random() * (max - min) + min)
        while (code.length < 6) {
            code = code + get_digit
        }
        return code;
    }
    try {
        User.findOne({ email: email })
            .then(user => {
                if (user === null) {
                    res.json({ message: "email does not exist" })
                } else {
                    bcryptjs.compare(password, user.password, (err, data) => {
                        if (err) {
                            return res.json({ message: err })
                        }
                        if (data) {
                            const code = generate_code(1, 10)
                            bcryptjs.hash(newPassword, 10)
                                .then(hashedPassword => {
                                    if (generated_codes.find(i => i.email === email) === null) {
                                        generated_codes.push({ email: email, hashedPassword: hashedPassword, code: code })
                                    } else {
                                        generated_codes.map(i => {
                                            if (i.email === email) {
                                                i.code = generate_code(1, 10)
                                            }
                                        })
                                    }

                                    const mailOptions = {
                                        from: "resource-pro <peterolanrewaju22@gmail.com>",
                                        to: email,
                                        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
                                        subject: "Reset your code",
                                        html: `<p>${code}</p>`
                                    }
                                    transporter.sendMail(mailOptions, (err, info) => {
                                        console.log(generated_codes)
                                        if (err) return res.status(400).send(err.message)
                                        res.sendStatus(200)
                                    })
                                })
                        } else {
                            res.json({ message: "wrong password!" })
                        }
                    })
                }
            })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.post("/reset-password", async (req, res) => {
    const { email, code } = req.body
    if (!isEmail(email) || !code) return res.status(400).json({ success: false, message: "incomplete data" })
    generated_codes.map(i => {
        if (i.email === email && i.code === code) {  // === check for int or str
            User.findOneAndUpdate(
                { email: email },
                { $set: { password: i.hashedPassword } }
            )
                .then(() => {
                    refresh_tokens_array = refresh_tokens_array.filter(i => i.email !== email);
                    generated_codes = generated_codes.filter(i => i.email !== email);
                })
                .then(
                    res.json({ message: "password updated" })
                )
        }
    })
});

router.post("/refresh-access-token", refreshAuth, async (req, res) => {
    const refreshToken = req.body.refreshToken
    if (!refreshToken) return res.json({ success: false, message: "Access denied" })

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
        if (err) {
            if (err.name === "TokenExpiredError") return res.json({ success: false, message: "log in" })
            console.log(err)
            return res.json({ success: false, message: "auth error" })
        }
        const accessToken = jwt.sign(
            {
                email: user.email,
                first_name: user.first_name
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: "10m" })
        res.status(200).json({ success: true, accessToken: accessToken })
    })
});

router.post("/logout", auth, async (req, res) => {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ success: false, message: "incomplete data" })
    refresh_tokens_array.find(i => i.refreshToken === refreshToken) && await RefreshToken.findOneAndDelete({ refreshToken: refreshToken })
        .then(
            refresh_tokens_array = refresh_tokens_array.filter(i => {
                i.refreshToken !== refreshToken
            })
        )
        .then(
            res.json({ success: true, message: "logged out" })
        )
    res.end()
});

router.post("/verify-email", auth, async (req, res) => {
    const { email } = req.body
    if (!isEmail(email)) return res.status(400).json({ success: false, message: "incomplete data" })
    try {
        User.findOne({ email: email.toLowerCase() })
            .then(result => {
                if (result) {
                    res.json({ email: email, message: "exists" })
                }
                else {
                    res.json({ email: email, message: "notExist" })
                }
            })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.post("/verify-number", auth, async (req, res) => {
    const { phoneNumber } = req.body
    if (!Array.isArray(phoneNumber)) return res.status(400).json({ success: false, message: "incomplete data" })
    try {
        const valid = (await Promise.all(
            phoneNumber.map(async (i) => {
                const result = await User.findOne({ phone_number: cleanPhoneNumber(i) });
                return result && i;
            })
        )
        ).filter(Boolean)

        res.json({ success: true, valid: valid })
        console.log(valid)
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.post("/domain", auth, upload.single("file"), async (req, res) => {
    const { domainName, status, title, delegates } = req.body
    const logo = req.file?.filename
    if (!domainName || !isStatus || !title) return res.json({ success: false, message: "incomplete data" })
    try {
        const creator = await User.findOne({ email: req.auth.email })
        if (!creator) return res.json({ success: false, message: "no user" })
        const { delegateList, delegateFcmToken } = await getDelegates(delegates, creator._id)
        if (status === "private" && delegateList.length === 0) {
            return res.json({ success: false, message: "add at least one valid delegate" })
        }
        const newDomain = new Domain({
            domain: domainName.trim(),
            creator_id: creator._id,
            logo: logo,
        })

        const savedDomain = await newDomain.save()
        const savedSector = await Sector.create({
            domain_id: savedDomain._id,
            creator_id: creator._id,
            title: title,
            status: status,
            data: []
        })
        const domainObj = savedDomain.toObject()
        if (status === "private") {
            await User.updateMany({ _id: { $in: delegateList } }, { $addToSet: { sectors: savedSector._id } })
            const message = {
                tokens: delegateFcmToken.flat(),
                notification: {
                    title: "Telli",
                    body: `You have been added to ${title} of (${domainName})`,
                },
                data: { domain: JSON.stringify(domainObj[0]) },
            }
            await fadmin.messaging().sendEachForMulticast(message);
        }
        res.status(200).json({ success: true, domain: domainObj });
    } catch (err) {
        console.log(err)
        return res.status(500).json({ success: false, message: "an error occured" });
    }
});

router.post("/sector/:domain_id", auth, upload.none(), async (req, res) => {
    const _id = req.params.domain_id
    const { title, status, delegates } = req.body
    if (!isId(_id) || !title || !status) return res.status(400).json({ success: false, message: "incomplete data" }) //check if delegate str always end with "," from req
    try {
        const creator = await User.findOne({ email: req.auth.email })
        const domain = await Domain.findById(_id)
        if (!domain) return res.json({ success: false, message: "no domain found" })
        // if (!domain._id.equals(creator._id)) return res.json({ success: false, message: "unauthorised" }) //allows only the creator to add more sectors
        const exists = await Sector.exists({ domain_id: domain._id, title: title })
        if (exists) return res.json({ success: false, message: "sector already exists" })
        const newSector = new Sector({
            domain_id: domain._id,
            creator_id: creator._id,
            title: title,
            status: status
        })
        await newSector.save()
        if (domain.status === "private") { // use sector privacy?
            const { delegateList, delegateFcmToken } = await getDelegates(delegates, creator._id)
            await User.updateMany({ _id: { $in: delegateList } }, { $addToSet: { sectors: savedSector._id } })
        }
        res.json({ success: true, "message": "sector added", data: newSector })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.post("/issue/:sector_id", auth, upload.array("files", 4), async (req, res) => {
    // console.log("728", now)
    const sectorId = req.params.sector_id
    const { note } = req.body
    const pictures = req.files?.map(i => i.filename)
    if (!isId(sectorId) || !note) return res.status(400).json({ success: false, message: "incomplete data" })
    try {
        const sector = await Sector.findById(sectorId).select("domain_id")
        const user = await User.findOne({ email: req.auth.email }).select("_id")
        if (!sector || !user) return res.status(404).json({ success: false, message: 'sector not found' })

        const newIssue = new Issue({
            sector_id: sector._id,
            creator_id: user._id,
            note: note,
            pictures: pictures
        })
        const savedIssue = await newIssue.save()
        userNameSpace.to(sectorId).emit("note", { data: savedIssue, domainId: sector.domain_id.toString() })
        res.json({ success: true, data: savedIssue })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

//PATCH
router.patch("/user/domain/:domain_id", auth, async (req, res) => {
    const _id = req.params.domain_id
    if (!isId(_id)) return res.status(400).json({ success: false, message: "incomplete data" })
    try {
        const temp = await User.findOne({ email: req.auth.email }).select("_id")
        const domain = await Domain.findById(_id)
        if (!temp || !domain) return res.json({ success: false, message: "not found" })
        if (temp._id.equals(domain.creator_id)) return res.json({ success: false, message: "creator" })
        await User.updateOne(
            { _id: temp._id },
            { $pull: { sectors: { domain_id: _id } } }
        );
        res.json({ success: true, message: "removed from domain" })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.patch("/user/sector/:sector_id", auth, async (req, res) => {
    try {
        const data = req.body.data
        const sectorId = req.params.sector_id
        if (!isId(sectorId) || !data) return res.status(400).json({ success: false, message: "incomplete data" })
        const sectorExists = await Sector.exists({ _id: sectorId })
        if (!sectorExists) return res.json({ success: false, "message": "sector not found" })
        const userExists = User.findOneAndUpdate({
            $or: [
                { email: data },
                { phone_number: cleanPhoneNumber(data) }
            ]
        },
            { $addToSet: { sectors: sectorId } }
        )
        if (!userExists) return res.json({ success: false, "message": "user not found" })
        res.json({ "message": "delegate added successfully" })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.patch("/user/:sector_id", auth, async (req, res) => {
    try {
        const sectorId = req.params.sector_id
        if (!isId(sectorId)) return res.status(400).json({ success: false, message: "incomplete data" })
        const sectorExists = await Sector.exists({ _id: sectorId })
        if (!sectorExists) return res.json({ success: false, "message": "sector not found" })
        const userExists = await User.findOneAndUpdate({ email: req.auth.email }, { $addToSet: { sectors: sectorExists._id } })
        if (!userExists) return res.json({ success: false, "message": "user not found" })
        res.json({ success: true, "message": "delegated added successfully" })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.patch("/user/:issue_id", auth, async (req, res) => {
    try {
        const _id = req.params.issue_id
        const issueExists = await Issue.exists({ _id })
        if (!issueExists) return res.json({ success: false, message: "issue not found" })
        const user = await User.findOne({ email: req.auth.email }).select("issues_voted")
        if (user.issues_voted.includes(_id)) {
            await Issue.updateOne({ _id, voters_count: { $gt: 0 } }, { $inc: { voters_count: -1 } }, { runValidators: true })
            await User.updateOne(
                { email: req.auth.email },
                { $pull: { issues_voted: issueExists._id } }
            )
            res.json({ success: true, message: "vote removed", data: null })
        } else {
            await Issue.updateOne({ _id }, { $inc: { voters_count: 1 } })
            await User.updateOne(
                { email: req.auth.email },
                { $addToSet: { issues_voted: issueExists._id } }
            )
            res.json({ success: true, message: "vote counted", data: issueExists._id })
        }
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

router.patch("/sector/:sector_id/:domain_id", auth, async (req, res) => {
    const { sector_id, domain_id } = req.params
    const title = req.body.title
    if (!isId(sector_id) || !isId(domain_id) || title) return res.status(400).json({ success: false, message: "incomplete data" })
    try {
        const sectorExists = await Sector.findOne({ sector_id, domain_id, title })
        if (sectorExists) return res.json({ "message": `sector ${title} exists` })
        sectorExists.title = title
        await sectorExists.save()
        res.json({ "message": "sector updated" })
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});

//DELETE
router.delete("/user/sector/:sector_id", auth, async (req, res) => {
    const { sectorId } = req.params
    const phone_number = req.body.delegate
    if (!isId(sectorId) || !phone_number) return res.json({ sucess: false, mesage: "data" })
    try {
        const delegateId = await User.findOne({ phone_number: phone_number }, { _id: 1 })
        const userId = await User.findOne({ email: req.auth.email }, { _id: 1 })
        const creator = await Sector.findById(_id, { _id: 0, creator_id: 1 })
        if (userId._id.equals(creator.creator_id)) {
            const result = await User.updateOne(
                { _id: delegateId._id },
                { $pull: { sectors: sectorId } }
            )
            if (result.modifiedCount > 0) {
                res.json({ success: true, message: "delegate removed" })
            } else {
                res.json({ success: false, message: "failed to remove delegate" })
            }
        } else {
            const creator = await Domain.findById(_id, { _id: 0, creator_id: 1 })
            if (userId._id.equals(creator.creator_id)) {
                const result = await User.updateOne(
                    { _id: delegateId._id },
                    { $pull: { sectors: sectorId } }
                )
                if (result.modifiedCount > 0) {
                    res.json({ success: true, message: "delegate removed" })
                } else {
                    res.json({ success: false, message: "failed to remove delegate" })
                }
            }
            res.json({ success: false, message: "unauthorized" })
        }
    } catch (err) {
        console.log(err)
        res.status(500).json({ success: false, message: "an error occured" })
    }
});















// router.patch("/issue/:issue_id", auth, async (req, res) => {
//     const issue_id = req.params.issue_id
//     const note = req.body.note
//     if (!isId(issue_id) || !note) return res.status(400).json({ success: false, message: "incomplete data" })
//     try {
//         const issueExists = await Issue.findOneAndUpdate({ issue_id },
//             { $set: { note: note, pictures: ["acv", "bc"] } }
//         )
//         if (!issueExists) return res.json({ success: false, message: "issue not found" })
//         res.json({ success: true, message: "issue saved" })
//     } catch (err) {
//         console.log(err)
//         res.status(500).json({ success: false, message: "an error occured" })
//     }
// });


// router.get("/sector/:sector_id", auth, async (req, res) => {  //// ????
//     const _id = req.params.sector_id
//     try {
//         const temp = await User.findOne({ email: req.auth.email })
//         if (temp !== null) {
//             await Sector.updateOne(
//                 { _id: _id },
//                 { $pull: { delegates: temp.id } }
//             )
//             res.json({ success: true, "message": "success" })
//         }
//     } catch (err) {
//         console.log(err)
//         res.status(500).json({ success: false, message: "an error occured" })
//     }
// });
module.exports = router
// 67950882ad83535f24921d8f