# Skill: new_item

## Description
This skill is designed to generate a comprehensive, structured AI System Enhancement Blueprint. It guides the agent through the entire lifecycle of proposing and validating a new system feature or improvement, starting with defining performance benchmarks, identifying adversarial test cases, and culminating in a detailed implementation plan. It ensures that all proposed enhancements are rigorously tested for robustness and edge-case handling.

## Triggers
*   "Plan an AI enhancement"
*   "System blueprint required"
*   "Define performance benchmarks for [system component]"
*   "Adversarial testing plan"
*   "Enhance system capability"

## 🔐 Tool Access
*   `System_Architecture_Diagrammer`: For visualizing the current and proposed system state.
*   `Benchmark_Generator`: For creating quantitative performance metrics (e.g., latency, accuracy thresholds).
*   `Adversarial_Test_Suite_Builder`: For generating edge-case and failure-mode tests (e.g., logical fallacy detection, input injection).
*   `Project_Management_Tracker`: For logging milestones, dependencies, and resource allocation.

## Execution Steps
1.  **Analyze Scope and Goal:** Prompt the user to define the core problem or desired enhancement (the "New Item").
2.  **Establish Benchmarks:** Utilize the `Benchmark_Generator` tool to define measurable performance metrics (KPIs) for the enhancement across core domains (e.g., accuracy must exceed 95%; latency must remain under 50ms).
3.  **Identify Vulnerabilities:** Use the `Adversarial_Test_Suite_Builder` to generate a comprehensive suite of adversarial and edge-case tests. These must cover logical fallacies, data corruption, and unexpected input types.
4.  **Blueprint Creation:** Generate the formal blueprint document using the `System_Architecture_Diagrammer` and `Project_Management_Tracker`. This blueprint must include:
    *   Current State Analysis (AS-IS).
    *   Proposed State Design (TO-BE).
    *   Resource Allocation and Timeline.
    *   Success Criteria (based on Step 2).
5.  **Review and Refinement:** Present the complete blueprint to the user for review, ensuring all defined benchmarks and test cases have been addressed and accepted.

## Hard Rules
*   **Mandatory Benchmarking:** The skill *must* define at least three distinct, measurable performance benchmarks before proceeding to the blueprint phase.
*   **Adversarial Coverage:** The generated blueprint must explicitly reference the use of adversarial testing, detailing at least one specific edge-case test (e.g., handling null inputs, detecting logical fallacies).
*   **Scope Limitation:** The skill cannot propose enhancements that fundamentally change the core operational domain without explicit, multi-stage approval from the user.
*   **Output Format:** The final output must be a structured, multi-section document adhering to the "Enhancement Blueprint" template.