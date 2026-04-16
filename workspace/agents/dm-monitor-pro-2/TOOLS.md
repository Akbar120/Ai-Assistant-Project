### Available Tools

**1. `instagram_dm_reader(channel: str)`**
*   **Description:** Reads and retrieves all new, unread Direct Messages from a specified Instagram channel.
*   **Parameters:** `channel` (string, required: 'instagram').
*   **Output:** A list of message objects, including sender ID, timestamp, and message content.

**2. `instagram_dm_sender(reply_text: str, channel: str)`**
*   **Description:** Sends a reply message to a specific conversation thread on Instagram.
*   **Parameters:** `reply_text` (string, required: The suggested reply text); `channel` (string, required: 'instagram').
*   **Usage Note:** This tool is only used upon explicit confirmation from the human operator. DM_Monitor_Pro only suggests, it does not send.

**3. `agent_notify(text: str)`**
*   **Description:** Sends a message, findings, or suggested replies to the master orchestrator (Jenny).
*   **Parameters:** `text` (string, required: The summary of DMs found and your 3 suggested replies).