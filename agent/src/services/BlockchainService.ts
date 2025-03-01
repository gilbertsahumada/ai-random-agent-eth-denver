
import { abi  } from "../abi/abi";
import { abi as abiFlow } from "../abi/abiFlow";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flowTestnet } from "viem/chains";
import { elizaLogger } from "@elizaos/core";
import { RandomParameters } from "../interfaces/Podcast";

export class BlockchainService {
    private publicClient;
    private walletClient;
    private contractAddress;
    private contractAddressFlow

    constructor(privateKey: string, contractAddress: string, contractAddressFlow: string) {
        const account = privateKeyToAccount(`0x${privateKey}`);
        console.log("Account:", account);
        this.contractAddressFlow = contractAddressFlow;
        this.contractAddress = contractAddress;
        
        this.publicClient = createPublicClient({
            chain: flowTestnet,
            transport: http()
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
}
