require('dotenv').config()
const bcryptjs = require("bcryptjs")
const express = require("express")
const jwt = require("jsonwebtoken")
const router = express.Router()
const nodemailer = require("nodemailer")
const Domain = require("../models/domain")
const User = require("../models/user")
const RefreshToken = require("../models/refresh_token")
const { auth } = require("../middlewares/auth")

let pending_emails = [];
let refresh_tokens_array = [];
const domain = "192.168.202.133:3030"
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

(async () => {
    const result = await RefreshToken.find({})
    refresh_tokens_array = result
})();

router.get("/test", auth, (req, res) => {
    res.send(req.auth)
})

router.post("/sign-up", (req, res) => {
    const {first_name, last_name, email, phone_number, password} = req.body
    const mailOptions = {
        from: "resource-pro <peterolanrewaju22@gmail.com>",
        to: email,
        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
        subject: "Verify your mail",
        html: `<p>Welcome! <a href="http://${domain}/api/user/verify/${token}">click to verify<a/></p>`
    }
    
    User.findOne({email: email})
        .then(result => {
            if (result) {
                res.json({message: "email already exists"})
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
                        pending_emails.push({email: email, property: user})
                    })
                const token = jwt.sign(
                    {
                        first_name: first_name,
                        email: email
                    },
                    process.env.EMAIL_VERI_KEY,
                    {expiresIn: "15m"}
                )
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) return res.status(400).send(err.message)
                    res.sendStatus(200)
                })
            }
        })
})

router.get("/verify/:token", (req, res) => {
    const token = req.params.token
    jwt.verify(token, process.env.EMAIL_VERI_KEY, (err, user) => {
        if (err){
            res.send("an error occured")
        } else {
            let email = user.email
            let user = pending_emails.find(i => i.email === email)
            if (user) {
                user = user.property
                user.save()
                    .then(pending_emails = pending_emails.filter(i => i.email !== email))
                    .then(res.send("Your email has been verified!"))
            } else {
                const saved = User.findOne({ email: user.email })
                if (saved) {
                    res.send("Your email has already been verified!")
                } else {
                    res.send("Please complete sign up")
                }
            }
        }
    })
})

router.post("/login", (req, res) => {
    const { email, password } = req.body
    const mailOptions = {
        from: "resource-pro <peterolanrewaju22@gmail.com>",
        to: email,
        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
        subject: "Login detected",
        html: `<p>Login detected </p>`
    }

    User.findOne({ email: email})
        .then(user => {
            if (user == null){
                res.json({ message: "email does not exist"})
            } else {
                bcryptjs.compare(password, user.password, (err, data) => {
                    if (err){
                        return res.json({message: err})
                    }
                    if (data){
                        const accessToken = jwt.sign(
                            {
                                email: user.email,
                                first_name: user.first_name
                            },
                            process.env.ACCESS_TOKEN_SECRET,
                            {expiresIn: "50m"}
                        )
                        const refreshToken = jwt.sign(
                            {
                                email: user.email,
                                device: req.headers['user-agent']
                            },
                            process.env.REFRESH_TOKEN_SECRET,
                            {expiresIn: "14d"}
                        )
                        const refresh_token = new RefreshToken({
                            email: email,
                            refreshToken: refreshToken
                        })
                        refresh_token.save()
                            .then(refresh_tokens_array.push({ email: email, refreshToken: refreshToken }))
                            .then(
                                res
                                // .cookie("refreshToken", refreshToken, { httpOnly: true, secure: false, sameSite: "Strict"}) // for web app
                                // .header("Authorization", accessToken) // for web app
                                .json({ accessToken: accessToken, refreshToken: refreshToken }) // for mobile apps
                            )
                            .then(
                                transporter.sendMail(mailOptions, (err, info) => {
                                    if (err) return res.status(400).send(err.message)
                                    res.sendStatus(200)
                                })
                            )
                    } else {
                        res.json({message: "wrong password!"})
                    }
                })
            }
        })
}) 

router.put("/reset", async(req, res) => {
    const { email, password, newPassword } = req.body
    User.findOne({ email: email })
    .then(user => {
        if (user == null){
            res.json({ message: "email does not exist"})
        } else {
            bcryptjs.compare(password, user.password, (err, data) => {
                if (err){
                    return res.json({message: err})
                }
                if (data){
                    bcryptjs.hash(newPassword, 10)
                    .then(hashedPassword => {
                        const user = new User({
                            password: hashedPassword
                        })
                        User.findOneAndUpdate({ email: email, password: hashedPassword })
                            .then(
                                refresh_tokens_array = refresh_tokens_array.filter(i => {
                                    i.email !== email
                                })
                            )
                            .then(
                                res.send("password updated")
                            )
                    })
                } else {
                    res.json({message: "wrong password!"})
                }
            })
        }
    })
})

router.post("/logout", auth, async(req, res) => {
    const { refreshToken } = req.body
    refresh_tokens_array.find(i => i.refreshToken === refreshToken) && await RefreshToken.findOneAndDelete({ refreshToken: refreshToken })
        .then(
                refresh_tokens_array = refresh_tokens_array.filter(i => {
                    i.refreshToken !== refreshToken
                })
            )
        .then(
            res.json({message: "logged out"})
        )
    res.end()
})

router.post("/refresh", auth, (req, res) => {
    const refreshToken = req.body.refreshToken
    if (!refreshToken) {
        return res.send("Access denied")
    }
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
        if (err) {
            if (err?.message.name === "TokenExpiredError"){
                return res.json({ message: "log in"})
            }
            return res.json({ message: "auth error" })
        } 
        const accessToken = jwt.sign(
            {
                email: user.email,
                device: user.device
            },
            process.env.ACCESS_TOKEN_SECRET,
            {expiresIn: "50m"})
        res.status(200).json({ accessToken: accessToken })
    })
})

router.get("/domain", auth, async(req, res) => {
    const domain = req.auth.email && await Domain.find({})
    res.json(domain)
})

router.post("/create-domain", auth, async(req, res) => {
    if (req.auth.email) {
        const newDomain = new Domain({
            domain: "University of Ibadan",
            creator: "Peterven",
            delegates: [{name:"userid1", role: "member"}, {name:"userid2", role: "member"}, {name:"userid3", role: "admin"}],
            logo: "http://example.com/image.jpg",
            public: true,
            sectors: [{
                title: "title",
                issues: [
                    {
                        note: "note",
                        date_resolved: Date.now(),
                        pictures: ["picture", "pictur"],
                    }
                ]},
            {
                title: "title",
                issues: [
                    {note: "note"},
                    {note: "note"}
                ]
            }]
        })
        const savedd = await newDomain.save()
        return res.json(savedd)
    }
    res.status(401).send("not authenticated")
})

router.patch("/edit-domain/:_id", auth, async(req, res) => {
    const _id = req.params.id
    const title = req.body.title
    if (req.auth.email) {
        const domainExists = await Domain.findByIdAndUpdate(_id, {title: title}, {new: true})
        if (!domainExists) {
            res.json({"message": "domain does not exist"})
        } else {
            res.json(domainExists)
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.post("/create-sector/:_id", auth, async(req, res) => {
    try {
        const _id = req.params.id
        const title = req.body.title
        if (req.auth.email) {
            const exists = await Domain.findByIdAndUpdate(_id, { $addToSet: {
                sectors: {title: title}}}, {new: true})
            if (!exists) {
                res.json(sector)
            } else {
                res.json({"message": "sector already exists"})
            }
            return;
        }
        res.status(401).send("not authenticated")
    } catch (err){
        res.json({"message": "ann error occured under create-sector"})
    }
})

router.patch("/edit-sector-title/:_id", auth, async(req, res) => {
    const _id = req.params.id
    const title = req.body.title
    if (req.auth.email) {
        const exists = await Domain.findOneAndUpdate({_id, "sectors.title": "testsectorr"},
            {$set: { "sectors.$.title": "testsectorr" }}
        )
        if (!exists) {
            res.json({"message": "sector updated"})
        } else {
            res.json({"message": "sector already exists"})   
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.patch("/create-issue/:_id", auth, async(req, res) => {
    const _id = req.params.id
    const { title, note } = req.body.title
    if (req.auth.email) {
        const domainSectorExists = await Domain.findOneAndUpdate({_id, "sectors.title": title},
            {$push: { "sectors.$.issues": {"note": note, "pictures": ["a", "b"]}}}
        )
        if (!domainSectorExists) {
            res.json({"message": "no domain to add issue"})
        } else {
            res.json({"message": "new issue created"})
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.patch("/edit-issue/:_id/:issues_id", auth, async(req, res) => {
    const { _id, issues_id } = req.params.id
    const { title, note } = req.body.title
    if (req.auth.email) {
        const issueExists = await Domain.findOneAndUpdate({_id, "sectors.title": title, "sectors.issues._id": issues_id},
            {$set: { "sectors.$.issues": {"note": note, "pictures": ["acv", "bc"]}}}
        )
        if (!issueExists) {
            res.json({"message": "issue not found"})
        } else {
            res.json({"message": "issue saved"})
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.patch("/vote/:_id/:issues_id", auth, async(req, res) => {
    const _id = req.params.id
    const title = req.body.title
    if (req.auth.email) {
        const issueExists = await Domain.findOneAndUpdate({_id, "sectors.title": "titttttle", "sectors.issues._id": issues_id},
            {$addToSet: {"sectors.$.issues.$[elem].resolved_votes": "67954c8753172e822100bab9"}},
            { new: true, arrayFilters: [{ "elem._id": "67954c8753172e822100babd" }] }
        )
        if (!issueExists) {
            res.json({"message": "issue not found"})
        } else {
            res.json({"message": " vote counted"})
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.patch("/remove-vote", auth, async(req, res) => {
    if (req.auth.email) {
        const issueExists = await Domain.findOne({_id: "67954c8753172e822100bab8", "sectors.title": "title", "sectors.issues._id": "67954c8753172e822100babd"})
        if (!issueExists) {
            res.json({"message": "issue not found"})
        } else {
            await Domain.findOneAndUpdate({_id: "67954c8753172e822100bab8", "sectors.title": "titttttle", "sectors.issues._id": "67954c8753172e822100babd"},
                {$pull: {"sectors.$.issues.$[elem].resolved_votes": "67954c8753172e822100bab4"}},
                { new: true, arrayFilters: [{ "elem._id": "67954c8753172e822100babd" }] }
            )
            res.json({"message": " vote removed"})
        }
        return;
    }
    res.status(401).send("not authenticated")
}) 

router.patch("/add-delegate", auth, async(req, res) => {
    if (req.auth.email) {
        const domainExists = await Domain.findByIdAndUpdate({_id: "67954c8753172e822100bab8"},
            {$addToSet: { delegates: 
                {
                    // _id: User._id,
                    name: "useuk"
                }              
            }}
        )
        if (!domainExists) {
            res.json({"message": "domain does not exist"})
        } else {
            res.json({"message": "delegated added successfully"})
        }
        return;
    }
    res.status(401).send("not authenticated")
})

router.patch("/edit-delegate-role", auth, async(req, res) => {
    if (req.auth.email) {
        return;
    }
    res.status(401).send("not authenticated")
})

module.exports = router

// 67950882ad83535f24921d8f