export interface RandomParameters {
    tone: string;
    narrativeStyle: string;
    unexpectedTwist: string;
}

export interface PodcastPrompt {
    instruction: string;
    topic: string;
    daily_messages: string[];
    random_parameters: RandomParameters;
    duration: string;
    language: string;
}

export interface PodcastMetadata {
    name: string;
    description: string;
    image: string;
    external_url: string;
}
