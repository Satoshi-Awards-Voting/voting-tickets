/*
  Generates a series of PDF files with QR codes. Each QR code is a 'child' of
  the mothership wallet.

  Also creates a JSON file with data needed to work with generated addresses.
*/

"use strict"

const BITBOXSDK = require("bitbox-sdk")
const BITBOX = new BITBOXSDK()
const QRCode = require("qrcode")
const touch = require("touch")
const mkdirp = require("mkdirp")
const fs = require("fs")
const pdf = require("html-pdf")
const emoji = require("node-emoji")
const chalk = require("chalk")
const addresses = []
const htmlTemplate = require("./html-template")

// A promise-based sleep function.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// pubList contains the public addresses for the tickets generated, and is
// safe to share publically. priveList contains the public address and the
// private key WIF for generated addresses, and is not safe to share publically.
const pubList = []
const privList = []

// Open the wallet generated with generate-wallet.
const main = async () => {
  let mnemonicObj
  try {
    mnemonicObj = require(`${__dirname}/../output/wallets/motherShipWallet.json`)
  } catch (err) {
    console.log(
      `Could not open mnemonic.json. Generate a mnemonic with generate-wallet first.
      Exiting.`
    )
    process.exit(0)
  }

  const addressCount = mnemonicObj.mothership.children

  // create needed directory structure
  const htmlDir = `${__dirname}/../output/html`
  mkdirp(`${htmlDir}`, err => {})
  mkdirp(`${htmlDir}/privKeyWIFs`, err => {})

  const pdfDir = `${__dirname}/../output/pdf`
  mkdirp(`${pdfDir}`, err => {})
  mkdirp(`${pdfDir}/privKeyWIFs`, err => {})

  const jsonDir = `${__dirname}/../output/json`
  mkdirp(`${jsonDir}`, err => {})

  // root seed buffer
  const rootSeed = BITBOX.Mnemonic.toSeed(mnemonicObj.mnemonic)

  // master HDNode
  const masterHDNode = BITBOX.HDNode.fromSeed(rootSeed)

  // BIP44
  const bip44 = BITBOX.HDNode.derivePath(masterHDNode, "m/44'/145'")

  for (let i = 0; i < addressCount; i++) {
    console.log(`html: ${i}`)
    await sleep(100)
    // derive the ith external change address from the BIP44 account HDNode
    const node = BITBOX.HDNode.derivePath(
      bip44,
      //`${result.hdAccount ? result.hdAccount : 0}'/0/${i}`
      `0'/0/${i}`
    )

    // Generate the public address.
    const pubAddr = BITBOX.HDNode.toCashAddress(node)

    // get the priv key in wallet import format
    const wif = BITBOX.HDNode.toWIF(node)
    //console.log(`WIF for address ${i}: ${wif}`)

    // Add the public address to the public list.
    pubList.push(pubAddr)

    // Add the public and private info to the private list.
    const privData = {
      addr: pubAddr,
      wif: wif
    }
    privList.push(privData)

    // create empty html file
    touch(`${htmlDir}/privKeyWIFs/paper-wallet-wif-${i}.html`)

    // create qr code
    QRCode.toDataURL(wif, (err, wifQR) => {
      // save to html file
      fs.writeFileSync(
        `${htmlDir}/privKeyWIFs/paper-wallet-wif-${i}.html`,
        htmlTemplate(wifQR)
      )
    })
  }

  for (let i = 0; i < addressCount; i++) {
    console.log(`pdf: ${i}`)
    await sleep(2000)

    // save to pdf
    var options = {
      width: "170mm",
      height: "260mm"
    }

    // get html file
    const privKeyWIFsHtml = fs.readFileSync(
      `${htmlDir}/privKeyWIFs/paper-wallet-wif-${i}.html`,
      "utf8"
    )

    // save to pdf
    pdf
      .create(privKeyWIFsHtml, options)
      .toFile(`${pdfDir}/privKeyWIFs/paper-wallet-wif-${i}.pdf`, (err, res) => {
        if (err) return console.log(err)
      })
  }

  // Write out the public data to a JSON file for later processing.
  await writeFile(
    JSON.stringify(pubList, null, 2),
    `${jsonDir}/public-addresses.json`
  )

  // Combine mothership wallet and private data list into a single JSON file.
  const privData = {
    mothership: mnemonicObj,
    children: privList
  }
  await writeFile(
    JSON.stringify(privData, null, 2),
    `${jsonDir}/private-addresses.json`
  )

  console.log(chalk.green("All done."), emoji.get(":white_check_mark:"))
  console.log(emoji.get(":rocket:"), `html and pdfs written successfully.`)
}

main()

// Expects an input string and write the file to the file path.
async function writeFile(inStr, filePath) {
  try {
    fs.writeFile(filePath, inStr, err => {
      if (err) throw err

      console.log(`Successfully wrote to file ${filePath}`)
    })
  } catch (err) {
    console.error(`Error in create-addresses.js/writeFile()`)
    throw err
  }
}
