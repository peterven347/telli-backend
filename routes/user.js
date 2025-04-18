require('dotenv').config()
const bcryptjs = require("bcryptjs")
const express = require("express")
const fs = require("fs")
const jwt = require("jsonwebtoken")
const multer = require("multer")
const nodemailer = require("nodemailer")
const path = require("path")
const router = express.Router()

const Domain = require("../models/domain")
const User = require("../models/user")
const RefreshToken = require("../models/refresh_token")
const { auth } = require("../middlewares/auth")
const { default: mongoose } = require('mongoose')

let pending_emails = [];
let refresh_tokens_array = [];
let generated_codes = [];
const url_domain = "192.168.38.143:3030"
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
        const dynamicDest = "files/domainImg";
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
}

const upload = multer({ storage: storage, fileFilter: fileFilter });

// (async () => {
//     await Domain.syncIndexes()
//     const result = await RefreshToken.find({})
//     refresh_tokens_array = result
// })();

router.get("/test", async(req, res) => {
    const yy = await Domain.listIndexes()
    console.log(yy)
    res.end()
})

router.post("/sign-up", (req, res) => {
    const {first_name, last_name, email, phone_number, password} = req.body
    User.findOne({email: email})
        .then(result => {
            if (result) {
                console.log("exists")
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

                const mailOptions = {
                    from: "resource-pro <peterolanrewaju22@gmail.com>",
                    to: email,
                    replyTo: "peterolanrewaju22+resoucepro@gmail.com",
                    subject: "Verify your mail",
                    html: `<p>Welcome! <a href="http://${url_domain}/api/user/verify/${token}">click to verify<a/></p>`
                }
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        return res.status(400).json({message: "an error occured, check that your details are complete"})
                    }
                    res.status(200).json({message: "A verification link has been sent to", resMail: email})
                })
            }
        })
})

router.get("/verify/:token", (req, res) => {
    const token = req.params.token
    jwt.verify(token, process.env.EMAIL_VERI_KEY, (err, _user) => {
        if (err){
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
})

router.post("/login", (req, res) => {
    const { email, password } = req.body
    const mailOptions = {
        from: "resource-pro <peterolanrewaju22@gmail.com>",
        to: email,
        replyTo: "peterolanrewaju22+resoucepro@gmail.com",
        subject: "Login detected",
        html: `<p>Take action if this wasnt you</p>`
    }

    User.findOne({ email: email})
        .then(user => {
            if (user == null){
                console.log(1)
                res.json({ message: "email does not exist"}) //
            } else {
                bcryptjs.compare(password, user.password, (err, data) => {
                    if (err){
                        console.log(2)
                        return res.json({message: "Incorrect password"})
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
                                .json({ accessToken: accessToken, refreshToken: refreshToken, user: { first_name: user.first_name, last_name: user.last_name, email: user.email, phoneNum: user.phone_number} }) // for mobile apps
                            )
                            // .then(
                            //     transporter.sendMail(mailOptions, (err, info) => {
                            //         if (err) return res.status(400).json({message: err.message})
                            //             res.sendStatus(200)
                            //     })
                            // )
                            console.log(3)
                    } else {
                        console.log(4)
                        res.json({message: "wrong password!"})
                    }
                })
            }
        })
}) 

router.post("/get-reset-code", async(req, res) => {
    const { email, password, newPassword } = req.body
    const generate_code = (min, max) => {
        let code = "";
        const get_digit = Math.floor(Math.random() * (max - min) + min)
        while (code.length < 6) {
            code = code + get_digit
        }
        return code;
    }
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
                    const code = generate_code(1, 10)
                    bcryptjs.hash(newPassword, 10)
                    .then(hashedPassword => {
                        if(generated_codes.find(i => i.email === email) == null){
                            generated_codes.push({email: email, hashedPassword:hashedPassword, code: code})
                        } else {
                            generated_codes.map(i => {
                                if(i.email === email){
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
                    res.json({message: "wrong password!"})
                }
            })
        }
    })
})

router.post("/reset_password", async(req, res) => {
    const { email, code } = req.body
    generated_codes.map(i => {
        if(i.email === email && i.code == code){  // == check for int or str
            User.findOneAndUpdate({ email: email, password: i.hashedPassword })
            .then(() => {
                refresh_tokens_array = refresh_tokens_array.filter(i => i.email !== email);
                generated_codes = generated_codes.filter(i => i.email !== email);
            })            
            .then(
                res.send("password updated")
            )
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

router.post("/refresh-access-token", auth, (req, res) => {
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
    if (req.auth.email) {
        const temp = await User.findOne({email: req.auth.email})
        if (temp !== null) {
            const domain = await Domain.find({ $or : [{ "sectors.delegates": temp.id }, {"creator": temp.id}]})
            res.json(domain)
        }
    } else {
        res.json(req.auth)
    }
})

router.post("/create-domain", auth, upload.single("file"), async(req, res) => {
    if (req.auth.email) {
        const delegateList = []
        const {domainName, status, title, delegates } = req.body
        const creator = await User.findOne({email: req.auth.email})
        const logo = req.file?.path ? path.normalize(req.file.path) : null
        const _delegates = delegates.split(",")
        for (i of _delegates) {
            const temp = await User.findOne({email: i})
            if (temp !== null && temp.id !== creator.id) {
                delegateList.push(temp.id)
            }
        }
        if (delegateList.length === 0) {
            res.json({message: "add at least one valid delegate"})
            return;
        }
        const newDomain = new Domain({
            domain: domainName,
            creator: creator.id,
            logo: logo,
            status: status,
            sectors: [
                {
                    title: title,
                    delegates: delegateList,
                    // data: [
                    //     {
                    //         note: req.body?.note,
                    //         date_resolved: Date.now(),
                    //         pictures: [],
                    //     }
                    // ]
                }
            ]
        })
        const savedd = await newDomain.save()
        console.log(savedd)
        return res.json({message: "savedd"})
        // return res.json(savedd)
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

router.post("/verify-email", async(req, res) => {
    const { email } = req.body
    User.findOne({email: email})
    .then(result => {
        if (result) {
            res.json({email: email, message: "exists"})
        }
        else{
            res.json({email: email, message: "notExist"})
        }
    })
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