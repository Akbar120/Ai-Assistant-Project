# Skill: and_test_basic_text_analyzer

## Description
This skill provides comprehensive linguistic analysis of provided text input. It accepts a block of text and returns three distinct metrics: the total word count, the total character count (including spaces and punctuation), and the count of unique words found within the text. This is useful for content auditing, summarization checks, and basic text metrics gathering.

## Triggers
*   "Analyze the text for me"
*   "Count the words in this passage"
*   "What is the word count of this article?"
*   "Give me the text metrics for"
*   "Analyze this block of text"

## 🔐 Tool Access
*   `text_processor`: A utility capable of tokenizing, counting characters, and calculating set cardinality (for unique words).

## Execution Steps
1.  **Input Validation:** The agent must first check if the user prompt contains sufficient text to analyze. If no text is provided, the skill must immediately fail and prompt the user to supply the required text.
2.  **Text Extraction:** The agent must reliably extract the target text block from the user's prompt, regardless of surrounding conversational filler.
3.  **Character Count Calculation:** Use the `text_processor` to calculate the total number of characters in the extracted text.
4.  **Word Count Calculation:** Use the `text_processor` to tokenize the text and count the total number of resulting tokens (words).
5.  **Unique Word Count Calculation:** Use the `text_processor` to filter the tokens, normalize them (e.g., convert to lowercase, remove basic punctuation), and calculate the size of the resulting unique set.
6.  **Output Generation:** Compile the three calculated metrics (Word Count, Character Count, Unique Word Count) into a single, structured, and easily readable response for the user.

## Hard Rules
*   **Mandatory Input:** The skill cannot execute if the extracted text is empty or consists only of whitespace.
*   **Normalization:** All word counting and unique word calculations must be case-insensitive (i.e., "The" and "the" count as the same unique word).
*   **Output Format:** The final output must always present the three metrics clearly labeled (e.g., "Word Count: X", "Character Count: Y", "Unique Word Count: Z").
*   **Failure Handling:** If the `text_processor` tool fails to execute, the skill must gracefully report the technical failure rather than guessing or providing incorrect data.