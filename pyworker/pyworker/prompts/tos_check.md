You will receive the Markdown content of a website page. Determine if the page is a complete. If the page was blocked (e.g. by Cloudflare or similar), incomplete (e.g. requires JavaScript), irrelevant (login/signup/CAPTCHA), set isComplete to false.

If the page contains meaningful, coherent, valid service information or policy content, with no obvious blocking or truncation, set isComplete to true.

Format your response as a valid JSON object matching this type:

{{schema}}
