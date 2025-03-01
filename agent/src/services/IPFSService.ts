import { PinataSDK } from "pinata-web3";
import { readFileSync } from 'fs';
import { elizaLogger } from "@elizaos/core";
import { PodcastMetadata } from "../interfaces/Podcast";

export class IPFSService {
    private pinata: PinataSDK;

    constructor(pinataJwt: string) {
        this.pinata = new PinataSDK({
            pinataJwt,
            pinataGateway: "ipfs.io",
        });
    }

    async getFileContent(ipfsHash: string): Promise<any> { 
        try {
            const file = await this.pinata.gateways.get(ipfsHash);
            return file;
        } catch (error) {
            elizaLogger.error("IPFS Download Error:", error);
            throw error;
        }
    }

    async uploadAudioFile(filePath: string): Promise<string> {
        try {
            const fileData = readFileSync(filePath);
            const file = new File(
                [new Uint8Array(fileData)],
                filePath.split('/').pop() || 'audio.mp3',
                { type: 'audio/mp3' }
            );

            const upload = await this.pinata.upload.file(file);
            return upload.IpfsHash;
        } catch (error) {
            elizaLogger.error("IPFS Upload Error:", error);
            throw error;
        }
    }

    async uploadMetadata(metadata: PodcastMetadata): Promise<string> {
        try {
            const upload = await this.pinata.upload.json(metadata);
            return upload.IpfsHash;
        } catch (error) {
            elizaLogger.error("Metadata Upload Error:", error);
            throw error;
        }
    }

    async uploadStoryMetadata(metadata: any): Promise<string> {
        try {
            const upload = await this.pinata.upload.json(metadata);
            return upload.IpfsHash;
        } catch (error) {
            elizaLogger.error("uploadStoryMetadata Upload Error:", error);
            throw error;
        }
    }
}
