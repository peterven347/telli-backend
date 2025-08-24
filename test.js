const crypto = require('crypto');
// const tt = crypto.randomBytes(8).toString("hex")
// console.log(tt.toUpperCase())


const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: 'top secret',
  },
});

const privateKeyObject = crypto.createPrivateKey({
    key: privateKey,
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: 'top secret',
})

const encryptedData = crypto.publicEncrypt({
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_0AEP_PADDING,
    oaepHash: "sha256"
}, Buffer.from("Peterven"))

const decryptedData = crypto.privateDecrypt({
    key: privateKeyObject,
    padding: crypto.constants.RSA_PKCS1_0AEP_PADDING,
    oaepHash: "sha256"
}, encryptedData)

console.log(decryptedData.toString())
