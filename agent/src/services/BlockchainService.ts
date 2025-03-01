
import { abi } from "../abi/abi";
import { abi as abiFlow } from "../abi/abiFlow";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flowTestnet, storyTestnet } from "viem/chains";
import { elizaLogger } from "@elizaos/core";
import { RandomParameters } from "../interfaces/Podcast";
import { StoryClient, StoryConfig } from "@story-protocol/core-sdk";
import { aeneid } from "@story-protocol/core-sdk";
import { toHex } from 'viem';
import { createHash } from 'crypto'
import axios from 'axios'
import { IPFSService } from "./IPFSService";

export class BlockchainService {
    private publicClient;
    private walletClient;
    private storyClient;
    private contractAddress;
    private contractAddressFlow;
    private nftStoryAddress;


    constructor(privateKey: string, contractAddress: string, contractAddressFlow: string) {
        const account = privateKeyToAccount(`0x${privateKey}`);
        this.contractAddressFlow = contractAddressFlow;
        this.contractAddress = contractAddress;
        this.nftStoryAddress = "0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc"

        this.storyClient = StoryClient.newClient({
            account: account,
            transport: http(storyTestnet.rpcUrls[0]),
            chainId: "aeneid",
        });

        this.publicClient = createPublicClient({
            chain: flowTestnet,
            transport: http(),

        });

        this.walletClient = createWalletClient({
            chain: flowTestnet,
            transport: http(),
            account
        });
    }

    async requestRandomParameters(): Promise<RandomParameters> {
        try {
            const { request } = await this.publicClient.simulateContract({
                address: this.contractAddressFlow as `0x${string}`,
                abi: abiFlow,
                functionName: "generateParametersAndMintNFT",
                account: this.walletClient.account
            });

            console.log("Contract simulated");

            // Other EVM Chain
            /*
            const { request } = await this.publicClient.simulateContract({
                address: this.contractAddress,
                abi: abi,
                functionName: "generateParametersAndMintNFT",
            });
            */

            const txParams = await this.walletClient.writeContract(request);
            elizaLogger.info("Random Request Transaction:", txParams);
            return txParams
            // Wait for VRF event
            //return await this.waitForVRFEvent();

        } catch (error) {
            elizaLogger.error("Random Request Error:", error);
            throw error;
        }
    }

    private async waitForVRFEvent(): Promise<RandomParameters> {
        return new Promise((resolve, reject) => {
            let timeoutId: NodeJS.Timeout;
            let unwatch: (() => void) | undefined;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (unwatch) unwatch();
            };

            // Set timeout to prevent infinite waiting
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('Timeout waiting for VRF event'));
            }, 300000); // 5 minutes timeout

            try {
                unwatch = this.publicClient.watchContractEvent({
                    address: this.contractAddress,
                    abi: abi,
                    eventName: "PodcastParametersGenerated",
                    onError: error => {
                        console.error("Watch error:", error);
                        // Only cleanup and reject if it's not a "filter not found" error
                        if (!error.message?.includes('filter not found')) {
                            cleanup();
                            reject(error);
                        }
                    },
                    onLogs: logs => {
                        elizaLogger.info("VRF Event logs received:", logs);
                        cleanup();

                        const { args } = logs[0];
                        const { tone, narrativeStyle, unexpectedTwist } = args;

                        if (!tone || !narrativeStyle || !unexpectedTwist) {
                            reject(new Error("Invalid VRF parameters received"));
                            return;
                        }

                        resolve({
                            tone,
                            narrativeStyle,
                            unexpectedTwist
                        });
                    }
                });
            } catch (error) {
                cleanup();
                reject(error);
            }
        });
    }

    async updateTokenURI(metadataUrl: string): Promise<string> {
        try {
            const { request } = await this.publicClient.simulateContract({
                address: this.contractAddressFlow as `0x${string}`,
                abi: abi,
                functionName: "updateLastTokenURI",
                account: this.walletClient.account,
                args: [metadataUrl]
            });

            /*
            const { request } = await this.publicClient.simulateContract({
                address: this.contractAddress,
                abi: abi,
                functionName: "updateLastTokenURI",
                args: [metadataUrl]
            });
            */

            const tx = await this.walletClient.writeContract(request);
            elizaLogger.info("Token URI Updated:", tx);
            return tx;
        } catch (error) {
            elizaLogger.error("Update Token URI Error:", error);
            throw error;
        }
    }

    async callStoryProtocol(mediaUrl: string, nftMetadataIpfs: string): Promise<void> {
        try {

            const currentTimestamp = Math.floor(Date.now() / 1000).toString();
            const urlImage = 'https://moccasin-beautiful-sturgeon-965.mypinata.cloud/ipfs/bafkreifqzkq7tzppc22fa2f52sg2cruvomne2tp34yhdnx3ub2xw24b52m'
            const imageHash = this.getHashFromUrl(urlImage)
            const mediaHash = this.getHashFromUrl(mediaUrl)

            const ipMetadata = {
                title: 'BuffiCast 2025',
                description: 'This is a podcast generated by BuffiCast',
                createdAt: currentTimestamp,
                creators: [
                    {
                        name: 'BuffiCast',
                        address: '0x5ee75a1B1648C023e885E58bD3735Ae273f2cc52',
                        contributionPercent: 100,
                    },
                ],
                image: urlImage,
                imageHash: imageHash,
                mediaUrl: mediaUrl,
                mediaHash: mediaHash,
                mediaType: 'audio/mpeg',
            }

            const pinataJwt = process.env.PINATA_JWT
            if (!pinataJwt) {
                throw new Error("Missing Pinata JWT")
            }

            const ipfsService = new IPFSService(pinataJwt);

            const ipMetadataHash = await ipfsService.uploadStoryMetadata(ipMetadata)
            const ipHash = createHash('sha256').update(JSON.stringify(ipMetadataHash)).digest('hex')
            const nftHash = createHash('sha256').update(JSON.stringify(nftMetadataIpfs)).digest('hex')


            const response = await this.storyClient.ipAsset.mintAndRegisterIp({
                spgNftContract: this.nftStoryAddress,
                allowDuplicates: true,
                ipMetadata: {
                    ipMetadataURI: `https://ipfs.io/ipfs/${ipMetadataHash}`,
                    ipMetadataHash: `0x${ipHash}`,
                    nftMetadataURI: `https://ipfs.io/ipfs/${nftMetadataIpfs}`,
                    nftMetadataHash: `0x${nftHash}`,
                },
                txOptions: { waitForTransaction: true },
            })

            elizaLogger.info("Story Protocol Response:", response);
        } catch (error) {
            elizaLogger.error("Story Protocol Error:", error);
            throw error;

        }
    }

    async getFileHash(file: File): Promise<string> {
        const arrayBuffer = await file.arrayBuffer()
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
        return toHex(new Uint8Array(hashBuffer), { size: 32 })
    }

    async getHashFromUrl(url: string): Promise<string> {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        const buffer = Buffer.from(response.data);
        return "0x" + createHash("sha256").update(buffer).digest("hex");
    }
}
