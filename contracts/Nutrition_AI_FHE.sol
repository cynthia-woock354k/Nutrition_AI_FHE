pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NutritionAIFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error AlreadyProcessed();
    error InvalidParameter();

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    struct UserEncryptedData {
        euint32 dailyCalories;
        euint32 proteinGrams;
        euint32 carbGrams;
        euint32 fatGrams;
        euint32 waterIntakeMl;
        euint32 activityLevel; // e.g., 1-5 scale
        euint32 healthGoal;    // e.g., 1: lose weight, 2: gain muscle, 3: maintain
        euint32 allergyFlags;  // Bitmask for common allergies
    }

    struct EncryptedAnalysis {
        euint32 calorieTarget;
        euint32 proteinTarget;
        euint32 carbTarget;
        euint32 fatTarget;
        euint32 waterTarget;
        euint32 score; // Overall health score
    }

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 60; // Default 1 minute cooldown

    uint256 public currentBatchId = 1;
    bool public batchOpen = false;
    mapping(uint256 => mapping(address => UserEncryptedData)) public batchUserData;
    mapping(uint256 => bool) public batchProcessed;

    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event DataSubmitted(address indexed user, uint256 batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 batchId, uint256[] results);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true; // Owner is initially a provider
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        if (_cooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSet(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyProvider whenNotPaused {
        if (batchOpen) revert InvalidBatch(); // Cannot open if already open
        batchOpen = true;
        currentBatchId++;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        if (!batchOpen) revert InvalidBatch(); // Cannot close if not open
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitUserData(
        euint32 dailyCalories,
        euint32 proteinGrams,
        euint32 carbGrams,
        euint32 fatGrams,
        euint32 waterIntakeMl,
        euint32 activityLevel,
        euint32 healthGoal,
        euint32 allergyFlags
    ) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert InvalidBatch();

        lastSubmissionTime[msg.sender] = block.timestamp;

        UserEncryptedData memory data = UserEncryptedData({
            dailyCalories: dailyCalories,
            proteinGrams: proteinGrams,
            carbGrams: carbGrams,
            fatGrams: fatGrams,
            waterIntakeMl: waterIntakeMl,
            activityLevel: activityLevel,
            healthGoal: healthGoal,
            allergyFlags: allergyFlags
        });

        batchUserData[currentBatchId][msg.sender] = data;
        emit DataSubmitted(msg.sender, currentBatchId);
    }

    function requestAnalysis(uint256 batchId) external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (batchProcessed[batchId]) revert AlreadyProcessed();
        if (!FHE.isInitialized(batchUserData[batchId][msg.sender].dailyCalories)) revert InvalidBatch(); // Check if data exists for this provider in this batch

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        EncryptedAnalysis memory analysis = _computeAnalysis(batchId, msg.sender);

        // 1. Prepare Ciphertexts
        bytes32[] memory cts = new bytes32[](6);
        cts[0] = FHE.toBytes32(analysis.calorieTarget);
        cts[1] = FHE.toBytes32(analysis.proteinTarget);
        cts[2] = FHE.toBytes32(analysis.carbTarget);
        cts[3] = FHE.toBytes32(analysis.fatTarget);
        cts[4] = FHE.toBytes32(analysis.waterTarget);
        cts[5] = FHE.toBytes32(analysis.score);

        // 2. Compute State Hash
        bytes32 stateHash = _hashCiphertexts(cts);

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext memory ctx = decryptionContexts[requestId];

        // a. Replay Guard
        if (ctx.processed) revert ReplayAttempt();
        if (ctx.batchId == 0) revert InvalidBatch(); // Should have been set

        // b. State Verification
        // Rebuild cts in the exact same order as in requestAnalysis
        UserEncryptedData memory data = batchUserData[ctx.batchId][msg.sender]; // msg.sender is the provider who initiated
        EncryptedAnalysis memory analysis = _computeAnalysis(ctx.batchId, msg.sender); // Recompute analysis

        bytes32[] memory cts = new bytes32[](6);
        cts[0] = FHE.toBytes32(analysis.calorieTarget);
        cts[1] = FHE.toBytes32(analysis.proteinTarget);
        cts[2] = FHE.toBytes32(analysis.carbTarget);
        cts[3] = FHE.toBytes32(analysis.fatTarget);
        cts[4] = FHE.toBytes32(analysis.waterTarget);
        cts[5] = FHE.toBytes32(analysis.score);

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }
        // c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // d. Decode & Finalize
        uint256[] memory results = new uint256[](6);
        assembly {
            // Skip first 32 bytes (offset)
            let dataOffset := add(cleartexts, 0x20)
            results[0] := mload(dataOffset)          // calorieTarget
            results[1] := mload(add(dataOffset, 0x20)) // proteinTarget
            results[2] := mload(add(dataOffset, 0x40)) // carbTarget
            results[3] := mload(add(dataOffset, 0x60)) // fatTarget
            results[4] := mload(add(dataOffset, 0x80)) // waterTarget
            results[5] := mload(add(dataOffset, 0xa0)) // score
        }

        ctx.processed = true;
        decryptionContexts[requestId] = ctx; // Update storage
        batchProcessed[ctx.batchId] = true; // Mark batch as processed

        emit DecryptionCompleted(requestId, ctx.batchId, results);
    }

    function _computeAnalysis(uint256 batchId, address provider) internal view returns (EncryptedAnalysis memory) {
        UserEncryptedData memory data = batchUserData[batchId][provider];

        // Initialize constants (example values, should be configurable or more complex)
        euint32 BMR = FHE.asEuint32(1500); // Example Base Metabolic Rate
        euint32 ACTIVITY_FACTOR = FHE.asEuint32(50); // Example calories per activity level point
        euint32 PROTEIN_RATIO = FHE.asEuint32(2); // 2 grams per kg of target weight (simplified)
        // ... other constants

        // Simplified AI logic (example)
        // 1. Estimate TDEE (Total Daily Energy Expenditure)
        euint32 activityCalories = data.activityLevel.fheMul(ACTIVITY_FACTOR);
        euint32 tdee = BMR.fheAdd(activityCalories);

        // 2. Adjust based on health goal
        // e.g., lose weight (1): -500, gain muscle (2): +500, maintain (3): 0
        euint32 adjustment = FHE.asEuint32(0);
        ebool isGoal1 = data.healthGoal.fheEq(FHE.asEuint32(1));
        ebool isGoal2 = data.healthGoal.fheEq(FHE.asEuint32(2));
        adjustment = isGoal1.fheSelect(FHE.asEuint32(500).fheMul(FHE.asEuint32(-1)), adjustment); // if goal1, -500
        adjustment = isGoal2.fheSelect(FHE.asEuint32(500), adjustment); // if goal2, +500
        euint32 calorieTarget = tdee.fheAdd(adjustment);

        // 3. Macronutrient targets (simplified percentages)
        euint32 proteinTarget = calorieTarget.fheMul(FHE.asEuint32(30)).fheDiv(FHE.asEuint32(100)).fheDiv(FHE.asEuint32(4)); // 30% calories from protein
        euint32 fatTarget = calorieTarget.fheMul(FHE.asEuint32(25)).fheDiv(FHE.asEuint32(100)).fheDiv(FHE.asEuint32(9)); // 25% calories from fat
        euint32 carbTarget = calorieTarget.fheSub(proteinTarget.fheMul(FHE.asEuint32(4))).fheSub(fatTarget.fheMul(FHE.asEuint32(9))).fheDiv(FHE.asEuint32(4));


        // 4. Water target (e.g., 35ml per kg of target weight, or fixed amount)
        euint32 waterTarget = FHE.asEuint32(2500); // Example fixed target

        // 5. Score (simplified example: how close calories are to target)
        euint32 diff = data.dailyCalories.fheSub(calorieTarget);
        euint32 absDiff = diff.fheGe(FHE.asEuint32(0)).fheSelect(diff, FHE.asEuint32(0).fheSub(diff));
        euint32 score = FHE.asEuint32(100).fheSub(absDiff.fheMul(FHE.asEuint32(100)).fheDiv(calorieTarget.fheMax(FHE.asEuint32(1))));


        return EncryptedAnalysis({
            calorieTarget: calorieTarget,
            proteinTarget: proteinTarget,
            carbTarget: carbTarget,
            fatTarget: fatTarget,
            waterTarget: waterTarget,
            score: score
        });
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 val, uint256 plainVal) internal pure returns (euint32) {
        if (FHE.isInitialized(val)) {
            return val;
        }
        return FHE.asEuint32(plainVal);
    }

    function _requireInitialized(euint32 val) internal pure {
        if (!FHE.isInitialized(val)) revert InvalidParameter();
    }
}