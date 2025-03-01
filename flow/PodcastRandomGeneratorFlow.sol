// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PodcastRandomGeneratorFlow
 * @dev Smart contract for generating random podcast parameters and minting NFTs using Flow's native randomness
 */
contract PodcastRandomGeneratorFlow is ERC721URIStorage, Ownable {
    // Flow Cadence Arch contract for randomness
    address constant public cadenceArch = 0x0000000000000000000000010000000000000001;

    // NFT variables
    uint256 public s_tokenCounter;
    mapping(uint256 => PodcastMetadata) public s_podcastMetadata;
    uint256 public s_lastMintedTokenId;

    // Podcast format categories
    string[4] private s_tones = ["Friendly", "Sarcastic", "Inspiring", "Mysterious"];
    string[4] private s_narrativeStyles = [
        "Conversational (like chatting with a friend)", 
        "Journalistic (like a report)", 
        "Dramatic (like a play)", 
        "Minimalist (brief and direct)"
    ];
    string[4] private s_unexpectedTwists = [
        "A futuristic prediction", 
        "A curious fact related to the topic", 
        "An open question for the audience", 
        "A fictional cameo (e.g., 'imagine Elon Musk enters the chat')"
    ];

    // Struct to store podcast parameters
    struct PodcastParameters {
        string tone;
        string narrativeStyle;
        string unexpectedTwist;
    }

    // Struct to store podcast metadata
    struct PodcastMetadata {
        string tone;
        string narrativeStyle;
        string unexpectedTwist;
        string tokenURI;
    }

    // Events
    event PodcastParametersGenerated(string tone, string narrativeStyle, string unexpectedTwist);
    event NFTMinted(uint256 indexed tokenId, string initialURI);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);

    /**
     * @dev Constructor initializes the contract
     */
    constructor() 
        ERC721("Podcast Chapter", "PDCAST") 
        Ownable(msg.sender)
    {
        s_tokenCounter = 0;
    }

    /**
     * @dev Generate a random number within a range using Flow's native randomness
     * @param min Minimum value (inclusive)
     * @param max Maximum value (inclusive)
     * @return Random number within the specified range
     */
    function getRandomInRange(uint64 min, uint64 max) internal view returns (uint64) {
        // Static call to the Cadence Arch contract's revertibleRandom function
        (bool ok, bytes memory data) = cadenceArch.staticcall(abi.encodeWithSignature("revertibleRandom()"));
        require(ok, "Failed to fetch a random number through Cadence Arch");
        uint64 randomNumber = abi.decode(data, (uint64));

        // Return the number in the specified range
        return (randomNumber % (max + 1 - min)) + min;
    }

    /**
     * @dev Generates random podcast parameters and mints NFT
     * @return PodcastParameters The generated parameters
     */
    function generateParametersAndMintNFT() external onlyOwner returns (PodcastParameters memory) {
        // Generate random values for each category
        uint64 toneIndex = getRandomInRange(0, 3);
        uint64 styleIndex = getRandomInRange(0, 3);
        uint64 twistIndex = getRandomInRange(0, 3);
        
        // Set parameters based on random values
        string memory tone = s_tones[toneIndex];
        string memory narrativeStyle = s_narrativeStyles[styleIndex];
        string memory unexpectedTwist = s_unexpectedTwists[twistIndex];
        
        // Create parameters struct
        PodcastParameters memory params = PodcastParameters({
            tone: tone,
            narrativeStyle: narrativeStyle,
            unexpectedTwist: unexpectedTwist
        });
        
        // Mint NFT with initial URI
        string memory initialURI = "ipfs://placeholder-uri";
        uint256 newTokenId = s_tokenCounter;
        _safeMint(owner(), newTokenId);
        _setTokenURI(newTokenId, initialURI);
        
        // Store metadata
        s_podcastMetadata[newTokenId] = PodcastMetadata({
            tone: params.tone,
            narrativeStyle: params.narrativeStyle,
            unexpectedTwist: params.unexpectedTwist,
            tokenURI: initialURI
        });
        
        // Update state
        s_lastMintedTokenId = newTokenId;
        s_tokenCounter++;
        
        emit PodcastParametersGenerated(tone, narrativeStyle, unexpectedTwist);
        emit NFTMinted(newTokenId, initialURI);
        
        return params;
    }

    /**
     * @dev Generate parameters only without minting (for preview purposes)
     * @return tone The tone parameter
     * @return narrativeStyle The narrative style parameter
     * @return unexpectedTwist The unexpected twist parameter
     */
    function generateParametersOnly() external view returns (
        string memory tone,
        string memory narrativeStyle,
        string memory unexpectedTwist
    ) {
        uint64 toneIndex = getRandomInRange(0, 3);
        uint64 styleIndex = getRandomInRange(0, 3);
        uint64 twistIndex = getRandomInRange(0, 3);
        
        return (
            s_tones[toneIndex],
            s_narrativeStyles[styleIndex],
            s_unexpectedTwists[twistIndex]
        );
    }

    /**
     * @dev Update the URI of the last minted token
     * @param newURI The new URI to set for the token (IPFS URI after uploading audio)
     */
    function updateLastTokenURI(string calldata newURI) external onlyOwner {
        require(s_lastMintedTokenId < s_tokenCounter, "No token has been minted yet");
        
        // Update the token URI
        _setTokenURI(s_lastMintedTokenId, newURI);
        
        // Update the stored metadata
        s_podcastMetadata[s_lastMintedTokenId].tokenURI = newURI;
        
        emit TokenURIUpdated(s_lastMintedTokenId, newURI);
    }

    /**
     * @dev Get the metadata of a specific podcast NFT
     * @param tokenId The ID of the token to get metadata for
     * @return tone The tone parameter
     * @return narrativeStyle The narrative style parameter
     * @return unexpectedTwist The unexpected twist parameter
     * @return tokenURI The token URI
     */
    function getPodcastMetadata(uint256 tokenId) external view returns (
        string memory tone,
        string memory narrativeStyle,
        string memory unexpectedTwist,
        string memory tokenURI
    ) {        
        PodcastMetadata memory metadata = s_podcastMetadata[tokenId];
        return (
            metadata.tone,
            metadata.narrativeStyle,
            metadata.unexpectedTwist,
            metadata.tokenURI
        );
    }
}