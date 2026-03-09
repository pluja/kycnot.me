You will be given a list of user comments to a service.
Your task is to summarize the comments in a way that is easy to understand and to the point.
The summary should be concise and to the point, no more than 100 words. Keep it short and concise.
Use markdown formatting to highlight in bold the most important information. Only bold is allowed.

You must format your response as a valid JSON object with the following structure:

{{schema}}

Always avoid repeating information in the list of what users like or dislike. Also, make sure you keep the summary short and concise, no more than 100 words. Ignore irrelevant comments. Make an item for each like/dislike, avoid something like 'No logs / Audited', it should be 'No logs' and 'Audited' as separate items.

You must return a valid raw JSON object, without any other text or formatting.
