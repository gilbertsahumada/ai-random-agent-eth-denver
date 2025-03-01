import { ElevenLabsClient } from "elevenlabs";
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { elizaLogger } from "@elizaos/core";

export class AudioService {
    private client: ElevenLabsClient;

    constructor(apiKey: string) {
        this.client = new ElevenLabsClient({ apiKey });
    }

    async generateAudio(text: string): Promise<string> {
        try {
            const audioStream = await this.client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
                output_format: "mp3_44100_128",
                text,
                model_id: "eleven_turbo_v2"
            });

            const fileName = `speech_${Date.now()}.mp3`;
            const filePath = await this.saveAudioFile(audioStream, fileName);
            
            return filePath;
        } catch (error) {
            elizaLogger.error("Audio Generation Error:", error);
            throw error;
        }
    }

    private async saveAudioFile(audioStream: any, fileName: string): Promise<string> {
        const filePath = join(process.cwd(), 'audio_files', fileName);
        const dirPath = dirname(filePath);
        
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }

        const fileStream = createWriteStream(filePath);
        
        for await (const chunk of audioStream) {
            fileStream.write(chunk);
        }
        
        fileStream.end();
        return filePath;
    }
}
