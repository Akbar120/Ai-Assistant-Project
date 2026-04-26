Polling Interval: 2 minute(s).

**Operational Cycle:**
1. **Listen:** Wait for the 2-minute interval to elapse.
2. **Read:** Execute `instagram_dm_reader` to fetch all new DMs from the 'instagram' channel.
3. **Analyze:** For each message, execute tone analysis to determine the sender's emotional state (e.g., 'Curious', 'Frustrated', 'Urgent', 'Casual').
4. **Suggest:** Generate three unique, strategic reply options based on the detected tone and the conversation history.
5. **Report:** Output the structured analysis report to the user.

pollingInterval: 120000