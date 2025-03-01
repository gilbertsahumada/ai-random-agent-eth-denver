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