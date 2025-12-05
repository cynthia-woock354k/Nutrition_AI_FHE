# FHE-based Personal Nutritionist AI

The FHE-based Personal Nutritionist AI is a revolutionary health management tool that leverages **Zama's Fully Homomorphic Encryption (FHE) technology** to provide users with personalized dietary advice while ensuring their privacy is safeguarded. This cutting-edge AI nutritionist analyzes users’ dietary records, allergy history, and health goals by working directly with encrypted data, delivering daily meal recommendations and nutritional analysis that are both scientifically sound and entirely confidential.

## The Problem

In a world increasingly driven by digital health solutions, maintaining the privacy of personal health data remains a daunting challenge. Users often hesitate to share sensitive information regarding their dietary habits, allergies, and health targets due to concerns about data misuse and breaches of confidentiality. Traditional systems can expose this information, leading to trust issues and limiting the benefits of personalized health advice.

## The FHE Solution

This project addresses the privacy concerns surrounding sensitive health data using **Zama's open-source libraries**, particularly the **Concrete** and **TFHE-rs** libraries. By employing Fully Homomorphic Encryption, users can interact with their data without ever exposing it. This means our AI nutritionist can generate personalized dietary recommendations in a secure manner, ensuring that users' health information remains private and protected.

## Key Features

- **FHE-Encrypted Dietary Records:** User dietary and health information is encrypted with FHE, ensuring maximum privacy.
- **Homomorphic Nutritional Recommendations:** Our AI provides personalized nutrition advice based on encrypted data, enabling a tailored experience without compromising user privacy.
- **Scientific and Personalized Health Guidance:** The application offers evidence-based recommendations that align with individual health goals and dietary preferences.
- **User-Friendly AI Interaction:** Engage with the AI through a conversational interface, making health management simpler and more intuitive.

## Technology Stack

- **Zama SDK:** Utilizes Zama’s FHE libraries such as **Concrete** and **TFHE-rs** for secure computing.
- **Node.js:** JavaScript runtime for backend development.
- **Hardhat:** Ethereum development environment for building and deploying the smart contracts.
- **Solidity:** Language for writing smart contracts on Ethereum.

## Directory Structure

Here’s an overview of the directory structure for the **Nutrition_AI_FHE** project:

```
Nutrition_AI_FHE/
│
├── contracts/
│   └── Nutrition_AI_FHE.sol
│
├── scripts/
│   └── deploy.js
│
├── test/
│   └── nutritionAI.test.js
│
├── package.json
├── hardhat.config.js
└── README.md
```

## Installation Guide

To set up the FHE-based Personal Nutritionist AI project:

1. Make sure you have **Node.js** installed on your machine.
2. Navigate to the project directory.
3. Run the following command to install all necessary dependencies:

   ```bash
   npm install
   ```

   This will fetch the required Zama FHE libraries along with other dependencies.

**Important:** Do not use `git clone` or any URLs to download the project.

## Build & Run Guide

Once you have installed the dependencies, you can compile and run the project with the following commands:

1. **Compile Smart Contracts:**

   ```bash
   npx hardhat compile
   ```

2. **Run Tests:**

   ```bash
   npx hardhat test
   ```

3. **Deploy the Smart Contracts:**

   ```bash
   npx hardhat run scripts/deploy.js
   ```

4. **Start the AI Interaction:**

   To run the AI conversational interface, simply execute:

   ```bash
   node scripts/chatAI.js
   ```

## Acknowledgements

### Powered by Zama

We extend our sincere thanks to the **Zama team** for their pioneering work on Fully Homomorphic Encryption and the open-source tools that make confidential blockchain applications possible. Your commitment to privacy in the digital age is what empowers projects like ours to flourish.
