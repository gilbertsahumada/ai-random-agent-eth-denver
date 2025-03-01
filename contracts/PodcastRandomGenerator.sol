// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts@1.3.0/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts@1.3.0/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/**
 * @title PodcastRandomGenerator
 * @dev Smart contract for generating random podcast parameters and minting NFTs using Chainlink VRF and Automation
 */
contract PodcastRandomGenerator is ERC721URIStorage, VRFConsumerBaseV2Plus, AutomationCompatibleInterface {
    // Chainlink VRF variables
    address public immutable vrfCoordinator = 0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE; // AVAX Fuji
    bytes32 public immutable s_keyHash = 0xc799bd1e3bd4d1a41cd4968997a4e03dfd2a3c7c04b695881138580163f42887; // AVAX Fuji
    uint32 public callbackGasLimit = 500000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 3; // Need 3 random numbers for our 3 categories
    uint256 public s_subscriptionId;
    bool public nativePayment = false; // Set to true to pay for VRF requests with ETH instead of LINK

    // Request status tracking
    struct RequestStatus {
        bool fulfilled;
        bool exists;
        uint256[] randomWords;
        PodcastParameters parameters;
    }
    mapping(uint256 => RequestStatus) public s_requests; // requestId -> RequestStatus
    uint256 public s_lastRequestId;
    
    // NFT variables
    uint256 public s_tokenCounter;
    mapping(uint256 => PodcastMetadata) public s_podcastMetadata;
    uint256 public s_lastMintedTokenId;
    bool public s_pendingMint;

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
    event RequestSent(uint256 indexed requestId, uint32 numWords);
    event RequestFulfilled(uint256 indexed requestId, uint256[] randomWords);
    event PodcastParametersGenerated(uint256 indexed requestId, string tone, string narrativeStyle, string unexpectedTwist);
    event NFTMinted(uint256 indexed tokenId, string initialURI);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);

    /**
     * @dev Constructor initializes the contract with Chainlink VRF parameters
     * @param subscriptionId The subscription ID for Chainlink VRF
     */
    constructor(
        uint256 subscriptionId
    ) 
        ERC721("Podcast Chapter", "PDCAST") 
        VRFConsumerBaseV2Plus(vrfCoordinator)
        //Ownable(msg.sender)
    {
        s_subscriptionId = subscriptionId;
        s_tokenCounter = 0;
        s_pendingMint = false;
    }

    /**
     * @dev Requests randomness from Chainlink VRF to generate podcast parameters
     * @return requestId The ID of the VRF request
     */
    function requestRandomParameters() external onlyOwner returns (uint256 requestId) {
        // Ensure there's no pending mint operation
        require(!s_pendingMint, "There is a pending mint operation");
        
        // Request random values from Chainlink VRF
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: numWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: nativePayment})
                )
            })
        );
        
        // Initialize request status with empty parameters
        PodcastParameters memory emptyParams = PodcastParameters({
            tone: "",
            narrativeStyle: "",
            unexpectedTwist: ""
        });
        
        // Store request status
        s_requests[requestId] = RequestStatus({
            randomWords: new uint256[](0),
            exists: true,
            fulfilled: false,
            parameters: emptyParams
        });
        
        s_lastRequestId = requestId;
        s_pendingMint = true;
        
        emit RequestSent(requestId, numWords);
        return requestId;
    }

    /**
     * @dev Callback function used by Chainlink VRF to fulfill random values
     * @param requestId The ID of the request
     * @param randomWords The random values generated by Chainlink VRF
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        // Ensure request exists
        require(s_requests[requestId].exists, "Request not found");
        
        // Generate podcast parameters based on random values
        string memory tone = s_tones[randomWords[0] % s_tones.length];
        string memory narrativeStyle = s_narrativeStyles[randomWords[1] % s_narrativeStyles.length];
        string memory unexpectedTwist = s_unexpectedTwists[randomWords[2] % s_unexpectedTwists.length];
        
        // Store parameters for use by Chainlink Automation
        PodcastParameters memory params = PodcastParameters({
            tone: tone,
            narrativeStyle: narrativeStyle,
            unexpectedTwist: unexpectedTwist
        });
        
        // Update request status with parameters
        s_requests[requestId].fulfilled = true;
        s_requests[requestId].randomWords = randomWords;
        s_requests[requestId].parameters = params;
        
        emit RequestFulfilled(requestId, randomWords);
        emit PodcastParametersGenerated(requestId, tone, narrativeStyle, unexpectedTwist);
    }

    /**
     * @dev Check function for Chainlink Automation to determine if upkeep is needed
     * @return upkeepNeeded Boolean indicating if upkeep is needed
     * @return performData Data to be used in performUpkeep
     */
    function checkUpkeep(bytes calldata /* checkData */) external view override returns (bool upkeepNeeded, bytes memory performData) {
        // Check if there's a pending mint and if the last request has been fulfilled
        upkeepNeeded = s_pendingMint && s_requests[s_lastRequestId].fulfilled;
        return (upkeepNeeded, "");
    }

    /**
     * @dev Perform upkeep function for Chainlink Automation to mint NFT
     * @param /* performData -
     * Data used for the upkeep (not used in this implementation)
     */
    function performUpkeep(bytes calldata /* performData */) external override {
        // Recheck conditions
        if (s_pendingMint && s_requests[s_lastRequestId].fulfilled) {
            uint256 requestId = s_lastRequestId;
            
            // Retrieve stored parameters
            PodcastParameters memory params = s_requests[requestId].parameters;
            
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
            s_pendingMint = false;
            
            emit NFTMinted(newTokenId, initialURI);
        }
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
     * @dev Get the most recently generated podcast parameters
     * @return requestId The ID of the most recent request
     * @return tone The tone parameter
     * @return narrativeStyle The narrative style parameter
     * @return unexpectedTwist The unexpected twist parameter
     */
    function getLastPodcastParameters() external view returns (
        uint256 requestId,
        string memory tone,
        string memory narrativeStyle,
        string memory unexpectedTwist
    ) {
        require(s_requests[s_lastRequestId].fulfilled, "Request not yet fulfilled");
        
        PodcastParameters memory params = s_requests[s_lastRequestId].parameters;
        
        return (
            s_lastRequestId,
            params.tone,
            params.narrativeStyle,
            params.unexpectedTwist
        );
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

        //require(_exists(tokenId), "Token does not exist");
        
        PodcastMetadata memory metadata = s_podcastMetadata[tokenId];
        return (
            metadata.tone,
            metadata.narrativeStyle,
            metadata.unexpectedTwist,
            metadata.tokenURI
        );
    }

    /**
     * @dev Update VRF callback gas limit
     * @param _callbackGasLimit The new callback gas limit
     */
    function setCallbackGasLimit(uint32 _callbackGasLimit) external onlyOwner {
        callbackGasLimit = _callbackGasLimit;
    }

    /**
     * @dev Toggle between LINK and native token payment
     * @param _nativePayment Whether to pay with native token (true) or LINK (false)
     */
    function setNativePayment(bool _nativePayment) external onlyOwner {
        nativePayment = _nativePayment;
    }
}