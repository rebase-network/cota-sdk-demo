import React from "react"
import {
  addressToScript,
  serializeScript,
  scriptToHash,
  rawTransactionToHash,
  serializeWitnessArgs
} from '@nervosnetwork/ckb-sdk-utils'
import {
  Service,
  Collector,
  Aggregator,
  generateDefineCotaTx,
  generateIssuerInfoTx,
  generateMintCotaTx,
  generateClaimCotaTx,
  generateWithdrawCotaTx,
  generateTransferCotaTx,
  generateRegisterCotaTx,
  getAlwaysSuccessLock,
  Claim,
  CotaInfo,
  IssuerInfo,
  MintCotaInfo,
  TransferWithdrawal,
  IsClaimedReq
} from '@nervina-labs/cota-sdk'
import signWitnesses from '@nervosnetwork/ckb-sdk-core/lib/signWitnesses'
import styles from '../styles/Home.module.css'
import Head from 'next/head'

// TODO: use your private key and address
const TEST_PRIVATE_KEY = '0xd4537602bd78139bfde0771f43f7c007ea1bbb858507055d2ef6225d4ebec23e'
const TEST_ADDRESS = 'ckt1qyqdtuf6kx8f7664atn9xkmwc9qcv4phs4xsackhmh'
const RECEIVER_PRIVATE_KEY = '0x305fbaead56bde6f675fe0294e2126377d7025f36bf4bc1c8f840cb0e22eafef'
const RECEIVER_ADDRESS = 'ckt1qyqrvzu5yw30td23fzw5259j0l0pymj2lc9shtynac'
const OTHER_ADDRESS = 'ckt1qyqz8vxeyrv4nur4j27ktp34fmwnua9wuyqqggd748'

const getSecp256k1CellDep = (isMainnet: boolean): CKBComponents.CellDep => {
  if (isMainnet) {
    return {
      outPoint: {
        txHash: "0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c",
        index: "0x0",
      }, depType: 'depGroup'
    }
  }
  return {
    outPoint: {
      txHash: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
      index: "0x0",
    }, depType: 'depGroup'
  }
}

const secp256k1Dep = getSecp256k1CellDep(false)

const service: Service = {
  collector: new Collector({
    ckbNodeUrl: 'https://testnet.ckbapp.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckbapp.dev/indexer'
  }),
  aggregator: new Aggregator({
    registryUrl: 'https://cota.nervina.dev/registry-aggregator',
    cotaUrl: 'https://cota.nervina.dev/aggregator'
  }),
}

const ckb = service.collector.getCkb()

let cotaId: string = '0xd3b2bc022b52ce7282b354d97f9e5e5baf6698d7'

const registerCota = async (address = TEST_ADDRESS, privateKey = TEST_PRIVATE_KEY) => {
  const provideCKBLock = addressToScript(address)
  const unregisteredCotaLock = addressToScript(address)
  let rawTx = await generateRegisterCotaTx(service, [unregisteredCotaLock], provideCKBLock)
  rawTx.cellDeps.push(secp256k1Dep)

  const registryLock = getAlwaysSuccessLock(false)

  let keyMap = new Map<string, string>()
  keyMap.set(scriptToHash(registryLock), '')
  keyMap.set(scriptToHash(provideCKBLock), privateKey)

  const cells = rawTx.inputs.map((input, index) => ({
    outPoint: input.previousOutput,
    lock: index === 0 ? registryLock : provideCKBLock,
  }))

  const transactionHash = rawTransactionToHash(rawTx)

  const signedWitnesses = signWitnesses(keyMap)({
    transactionHash,
    witnesses: rawTx.witnesses,
    inputCells: cells,
    skipMissingKeys: true,
  })
  const signedTx = {
    ...rawTx,
    witnesses: signedWitnesses.map(witness => (typeof witness === 'string' ? witness : serializeWitnessArgs(witness))),
  }
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.log(`Register cota cell tx has been sent with tx hash ${txHash}`)
}

const defineNFT = async () => {
  const defineLock = addressToScript(TEST_ADDRESS)

  const cotaInfo: CotaInfo = {
    name: "Rostra launched",
    description: "Rostra launched, new age comes",
    image: "https://i.loli.net/2021/04/29/qyJNSE4iHAas7GL.png",
  }

  const totalSupply = 100
  let { rawTx, cotaId: cId } = await generateDefineCotaTx(service, defineLock, totalSupply, '0x00', cotaInfo)
  cotaId = cId
  console.log(` ======> cotaId: ${cotaId}`)
  console.log(' ===================== secp256k1Dep ===================== ')
  rawTx.cellDeps.push(secp256k1Dep)
  try {
    const signedTx = ckb.signTransaction(TEST_PRIVATE_KEY)(rawTx)
    console.log('signedTx: ', JSON.stringify(signedTx))
    let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
    console.info(`Define cota nft tx has been sent with tx hash ${txHash}`)
  } catch (error) {
    console.error('error happened:', error)
  }
}

const setIssuer = async () => {
  console.log(` ======> cotaId: ${cotaId}`)
  const cotaLock = addressToScript(TEST_ADDRESS)

  const issuer: IssuerInfo = {
    name: "Rostra",
    description: "Community building protocol",
    avatar: "https://i.loli.net/2021/04/29/IigbpOWP8fw9qDn.png",
  }

  let rawTx = await generateIssuerInfoTx(service, cotaLock, issuer)

  rawTx.cellDeps.push(secp256k1Dep)

  const signedTx = ckb.signTransaction(TEST_PRIVATE_KEY)(rawTx)
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.info(`Set issuer information tx has been sent with tx hash ${txHash}`)
}

const getNFTInfo = async () => {
  const aggregator = service.aggregator
  const lockScript = serializeScript(addressToScript(RECEIVER_ADDRESS))
  console.log('lockScript: ', lockScript)
  const holds = await aggregator.getHoldCotaNft({
    lockScript,
    page: 0,
    pageSize: 10,
  })
  console.log('======= holds: ', JSON.stringify(holds))

  const senderLockHash = await aggregator.getCotaNftSender({
    lockScript,
    cotaId,
    tokenIndex: '0x00000000',
  })
  console.log('======= senderLockHash: ', JSON.stringify(senderLockHash))

  const result = await aggregator.checkReisteredLockHashes([
    scriptToHash(addressToScript(TEST_ADDRESS)),
    scriptToHash(addressToScript(RECEIVER_ADDRESS)),
    scriptToHash(addressToScript(OTHER_ADDRESS)),
  ])

  //return: {"blockNumber":4779719,"registered":false}
  // OTHER_ADDRESS is not registered
  console.log(JSON.stringify(result))

  const defineInfo = await aggregator.getDefineInfo({
    cotaId,
  })

  //return: { "blockNumber": 4779719, "configure": "0x00", "issued": 4, "total": 100 }
  console.log(JSON.stringify(defineInfo))
}


const mint = async () => {
  console.log(` ======> cotaId: ${cotaId}`)
  const mintLock = addressToScript(TEST_ADDRESS)

  const mintCotaInfo: MintCotaInfo = {
    cotaId,
    withdrawals: [
      {
        tokenIndex: '0x00000000', // can only increase from 0x00000000
        state: '0x00',
        characteristic: '0x0505050505050505050505050505050505050505',
        toLockScript: serializeScript(addressToScript(RECEIVER_ADDRESS)),
      },
      {
        tokenIndex: '0x00000001',
        state: '0x00',
        characteristic: '0x0505050505050505050505050505050505050505',
        toLockScript: serializeScript(addressToScript(RECEIVER_ADDRESS)),
      },
    ],
  }
  let rawTx = await generateMintCotaTx(service, mintLock, mintCotaInfo)

  rawTx.cellDeps.push(secp256k1Dep)

  const signedTx = ckb.signTransaction(TEST_PRIVATE_KEY)(rawTx)
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.info(`Mint cota nft tx has been sent with tx hash ${txHash}`)
}

const claim = async () => {
  console.log(` ======> cotaId: ${cotaId}`)
  const claimLock = addressToScript(RECEIVER_ADDRESS)
  const withdrawLock = addressToScript(TEST_ADDRESS)

  const claims: Claim[] = [
    {
      cotaId,
      tokenIndex: '0x00000000',
    }
  ]
  let rawTx = await generateClaimCotaTx(service, claimLock, withdrawLock, claims)

  rawTx.cellDeps.push(secp256k1Dep)

  const signedTx = ckb.signTransaction(RECEIVER_PRIVATE_KEY)(rawTx)
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.info(`Claim cota nft tx has been sent with tx hash ${txHash}`)
}

const isClaimed = async () => {
  const aggregator = service.aggregator
  const lockScript = serializeScript(addressToScript(RECEIVER_ADDRESS))
  const lockHash = scriptToHash(addressToScript(RECEIVER_ADDRESS))
  const req: IsClaimedReq = {
    lockHash,
    cotaId,
    tokenIndex: '0x00000000'
  }
  console.log('lockScript: ', lockScript)
  const isClaimed = await aggregator.isClaimed(req)
  console.log(`======= isClaimed ${req.tokenIndex}: `, JSON.stringify(isClaimed))
}

const withdraw = async () => {
  console.log(` ======> cotaId: ${cotaId}`)
  const withdrawLock = addressToScript(RECEIVER_ADDRESS)
  const toLock = addressToScript(TEST_ADDRESS)

  const withdrawals: TransferWithdrawal[] = [
    {
      cotaId,
      tokenIndex: '0x00000000',
      toLockScript: serializeScript(toLock),
    },
  ]
  let rawTx = await generateWithdrawCotaTx(service, withdrawLock, withdrawals)

  rawTx.cellDeps.push(secp256k1Dep)

  const signedTx = ckb.signTransaction(RECEIVER_PRIVATE_KEY)(rawTx)
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.info(`Withdraw cota nft tx has been sent with tx hash ${txHash}`)
}

const transfer = async () => {
  console.log(` ======> cotaId: ${cotaId}`)
  const cotaLock = addressToScript(RECEIVER_ADDRESS)
  const withdrawLock = addressToScript(TEST_ADDRESS)

  const transfers: TransferWithdrawal[] = [
    {
      cotaId,
      tokenIndex: '0x00000001',
      toLockScript: serializeScript(addressToScript(OTHER_ADDRESS)),
    },
  ]
  let rawTx = await generateTransferCotaTx(service, cotaLock, withdrawLock, transfers)

  rawTx.cellDeps.push(secp256k1Dep)

  const signedTx = ckb.signTransaction(RECEIVER_PRIVATE_KEY)(rawTx)
  console.log('signedTx: ', JSON.stringify(signedTx))
  let txHash = await ckb.rpc.sendTransaction(signedTx, 'passthrough')
  console.info(`Transfer cota nft tx has been sent with tx hash ${txHash}`)
}

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>CoTA SDK Demo</title>
        <meta name="description" content="COTA SDK Demo" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          CoTA SDK Demo
        </h1>

        <p className={styles.description}>
          Before you start, chagne the TODO section in <code>src/pages/index.tsx</code> file.
        </p>
        <div className={styles.grid}>
          <div className={styles.card}>
            <button onClick={() => registerCota(TEST_ADDRESS, TEST_PRIVATE_KEY)}> registerCota(Owner) </button>
          </div>
          <div className={styles.card}>
            <button onClick={() => registerCota(RECEIVER_ADDRESS, RECEIVER_PRIVATE_KEY)}> registerCota(Receiver) </button>
          </div>
          <div className={styles.card}>
            <button onClick={defineNFT}> defineNFT </button>
          </div>
          <div className={styles.card}>
            <button onClick={setIssuer}> setIssuer </button>
          </div>
          <div className={styles.card}>
            <button onClick={getNFTInfo}> getNFTInfo </button>
          </div>
          <div className={styles.card}>
            <button onClick={mint}> mint </button>
          </div>
          <div className={styles.card}>
            <button onClick={claim}> claim </button>
          </div>
          <div className={styles.card}>
            <button onClick={isClaimed}> isClaimed </button>
          </div>
          <div className={styles.card}>
            <button onClick={withdraw}> withdraw </button>
          </div>
          <div className={styles.card}>
            <button onClick={transfer}> transfer </button>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://github.com/rebase-network/cota-sdk-demo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source Code
        </a>
        <a
          href="https://github.com/nervina-labs/cota-sdk-js"
          target="_blank"
          rel="noopener noreferrer"
        >
          CoTA Source Code
        </a>
        <a
          href="https://developer.mibao.net/docs/develop/cota/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          CoTA Docs
        </a>

      </footer>
    </div >
  )
}
