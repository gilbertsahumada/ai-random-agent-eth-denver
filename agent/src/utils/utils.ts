import { elizaLogger } from "@elizaos/core";

export const extractMessages = (inputText: string): string[] | false => {
    if (!inputText) return false;
    const regex = /"([^"]+)"/g;
    const quotes = inputText.match(regex);
    if (!quotes) {
        elizaLogger.error("No quoted messages found");
        return false;
    }

    const messages = quotes.map(quote => quote.replace(/^"|"$/g, '').trim());

    if (!messages || messages.length === 0) {
        elizaLogger.error("No messages found");
        return false;
    }

    return messages;
};