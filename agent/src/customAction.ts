import {
    HandlerCallback,
    IAgentRuntime,
    ISpeechService,
    Memory,
    ServiceType,
    State,
    type Action,
} from "@elizaos/core";
import { ElevenLabsClient } from "elevenlabs";
import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';
import { Anthropic, ClientOptions } from '@anthropic-ai/sdk';
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi } from "./abi";
import { elizaLogger } from "@elizaos/core";
import { PinataSDK } from "pinata-web3";
import { avalancheFuji } from "viem/chains";

export interface Prompt {
    instruction: string;
    topic: string;
    daily_messages: string[];
    random_parameters: {
        tone: string;
        narrative_style: string;
        unexpected_twist: string;
    };
    duration: string;
    language: string;
}

export const generatePodcast: Action = {
    name: "GENERATE_SPEECH",
    similes: [],
    description: "Check the balance of your Ethereum wallet",
    validate: async (_agent: IAgentRuntime, _memory: Memory, _state?: State) => {
        return true;
    },
    handler: async (_agent: IAgentRuntime, _memory: Memory, _state?: State, _options?: any, _callback?: HandlerCallback) => {
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY
        const elevenLabsApiKey = process.env.ELEVENLABS_XI_API_KEY
        const privateKey = process.env.EVM_PRIVATE_KEY
        const pinataJwt = process.env.PINATA_JWT

        let finalTone
        let finalNarrativeStyle
        let finalUnexpectedTwist

        if (!anthropicApiKey) {
            console.error("Anthropic API KEY NOT")
            throw new Error("Anthropic API KEY NOT")
        }

        if (!elevenLabsApiKey) {
            console.error("ElevenLabs API KEY NOT")
            throw new Error("ElevenLabs API KEY NOT")
        }

        if (!privateKey) {
            console.error("EVM PRIVATE KEY NOT")
            throw new Error("EVM PRIVATE KEY NOT")
        }

        if (!pinataJwt) {
            console.error("PINATA JWT NOT")
            throw new Error("PINATA JWT NOT")
        }

        const account = privateKeyToAccount(`0x${privateKey}`);

        const publicClient = createPublicClient({
            chain: avalancheFuji,
            transport: http('https://rpc.ankr.com/avalanche_fuji')
        });

        const walletClient = createWalletClient({
            chain: avalancheFuji,
            transport: http('https://rpc.ankr.com/avalanche_fuji'),
            account: account
        });

        const contractAddress = "0xA1FA59027B5ECf77c0E520F6b34Ca0f0cCb4E511"

        try {
            const { request } = await publicClient.simulateContract({
                account,
                address: contractAddress,
                abi: abi,
                functionName: "requestRandomParameters",
            });

            const tx = await walletClient.writeContract(request);
            elizaLogger.info("## Transaction Hash  ## :", tx);

            const eventPromise = new Promise((resolve, reject) => {
                let timeoutId: NodeJS.Timeout;
                let unwatch: (() => void) | undefined;

                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    if (unwatch) unwatch();
                };

                // Set timeout to prevent infinite waiting
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Timeout waiting for event'));
                }, 300000); // 5 minutes timeout

                try {
                    unwatch = publicClient.watchContractEvent({
                        address: contractAddress,
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
                            console.log("Event logs received:", logs);
                            cleanup();
                            resolve(logs);
                        }
                    });
                } catch (error) {
                    cleanup();
                    reject(error);
                }
            });

            const logs = await eventPromise;
            elizaLogger.info("Processing event logs");

            const { args } = logs[0];
            const { tone, narrativeStyle, unexpectedTwist } = args;
            if (tone && narrativeStyle && unexpectedTwist) {
                finalTone = tone
                finalNarrativeStyle = narrativeStyle
                finalUnexpectedTwist = unexpectedTwist
            } else {
                throw new Error("Error getting the random parameters")
            }
            elizaLogger.info("Random parameters:", { tone, narrativeStyle, unexpectedTwist });

        } catch (error) {
            elizaLogger.error("error : ", error);
        }

        const prompt: Prompt =
        {
            instruction: "Generate a podcast script based on the day's messages and the following instructions. JUST CREATE THE TEXT TO SPEECH , DO NOT add like <this is the speech ... > JUST THE SPEECH" +
                "DONT SOMETHING LIKE THIS: 'Here is a 60-second podcast script based on the provided instructions:'",
            topic: "Ethereum Denver 2025",
            daily_messages: [
                "Ethereum is the future of finance",
                "The market is bullish",
                "Best hackathon ever!"
            ],
            random_parameters: {
                tone: finalTone,
                narrative_style: finalNarrativeStyle,
                unexpected_twist: finalUnexpectedTwist
            },
            duration: "60 Seconds",
            language: "English"
        }

        const anthropic = new Anthropic({
            apiKey: anthropicApiKey,
        });

        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [{ role: "user", content: JSON.stringify(prompt) }],
        });


        const textResult = msg.content
            .filter(block => block.type === 'text')
            .map(block => (block as { type: 'text'; text: string }).text)
            .join('\n');

        try {

            const client = new ElevenLabsClient({ apiKey: elevenLabsApiKey });
            const audioStream = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
                output_format: "mp3_44100_128",
                text: textResult,
                model_id: "eleven_turbo_v2"
            });

            elizaLogger.info("## Audio stream Created #")

            const fileName = `speech_${Date.now()}.mp3`;
            const filePath = join(process.cwd(), 'audio_files', fileName);
            elizaLogger.info("File Path Creado .. ")
            // Crear el directorio si no existe
            const dirPath = dirname(filePath);
            if (!existsSync(dirPath)) {
                mkdirSync(dirPath, { recursive: true });
            }
            elizaLogger.info("Creando el WriteStream .. ")
            // Crear un write stream
            const fileStream = createWriteStream(filePath);
            elizaLogger.info("## FileStream Created ## ")
            // Pipe el stream de audio al archivo
            for await (const chunk of audioStream) {
                fileStream.write(chunk);
            }

            elizaLogger.info("Closing up ... ")
            // Cerrar el archivo
            fileStream.end();
            elizaLogger.info("## CLOSED ##")

            elizaLogger.info(`Audio saved to: ${filePath}`);

            // Cerrar el archivo
            fileStream.end();

            const pinata = new PinataSDK({
                pinataJwt: pinataJwt,
                pinataGateway: "moccasin-beautiful-sturgeon-965.mypinata.cloud",
            });

            try {
                const fileData = readFileSync(filePath);
                const file = new File(
                    [new Uint8Array(fileData)],
                    fileName,
                    { type: 'audio/mp3' }
                );

                const upload = await pinata.upload.file(file);

                elizaLogger.info("## UPLOAD ##")
                const ipfsHash = upload.IpfsHash;
                const uploadMetadata = await pinata.upload.json({
                    name: "BuffiCast Podcast",
                    description: `Podcast generated by BuffiCast, aleatory parameters: ${JSON.stringify(prompt.random_parameters)}`,
                    image: `https://ipfs.io/ipfs/${ipfsHash}`,
                })

                const metadataIpfsHash = uploadMetadata.IpfsHash;

                const { request: requestUpdateIpfs } = await publicClient.simulateContract({
                    account,
                    address: contractAddress,
                    abi: abi,
                    functionName: "updateLastTokenURI",
                    args: [`https://ipfs.io/ipfs/${metadataIpfsHash}`]
                });
    
                const txUpdate = await walletClient.writeContract(requestUpdateIpfs);
                elizaLogger.info("## Transaction Hash Updated ## :", txUpdate);
                elizaLogger.info("## Process Ended Succesfully ## :", txUpdate);


            } catch (error) {
                console.log(error);
            }

        } catch (error) {
            console.log("error : ", error);
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Generate me a text to speech" }
            },
            {
                user: "{{agentName}}",
                content: { text: "Let me do it for you!!", action: "GENERATE_SPEECH" }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Create me a podcast" }
            },
            {
                user: "{{agentName}}",
                content: { text: "I'll start to create!", action: "GENERATE_SPEECH" }
            }
        ]
    ]
}

