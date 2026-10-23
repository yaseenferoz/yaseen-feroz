# Yaseen Feroz — Portfolio

A responsive, build-free portfolio using HTML, CSS, and vanilla JavaScript. Open `index.html` directly, or serve this folder with an editor's local web server. No installation or build is needed.

## Files

- `index.html`: all portfolio content, project archive, certifications, career history, and contact form.
- `css/portfolio.css`: responsive layout and animations.
- `css/certifications.css`: credential cards and expandable list.
- `js/portfolio.js`: reveals, reading progress, India time, project filters, and contact submission.
- `resume/mdfiroz_resume.pdf`: the original downloadable résumé, unchanged.
- `data/certifications.json`: 28 certification records and their source links.
- `data/linkedin-skills.json`: the 69 original LinkedIn skill entries.
- `data/skill-mapping.json`: explicit mapping from source skills to normalized display labels.
- `data/linkedin-projects.txt`: project descriptions read from the profile, retained as a content reference.

## Content review — 23 October 2026

Reviewed the user's signed-in LinkedIn profile at https://www.linkedin.com/in/yaseen-feroz/ through the local browser: headline, About, four career roles, education, all 28 certifications, all 16 projects, all 69 skill entries, and language proficiencies.

The site presents 16 projects: six featured and 10 in a native expandable archive. The portfolio includes Codekraft MA QA Quality and Campuskraft as requested. The final-year RF vehicle speed-control project is described under education. Project artwork is typographic, not a product screenshot. No unverified deployment URLs or performance metrics have been added.

All 28 certifications are listed, with six featured and 22 expandable. All 27 available credential URLs match the profile; JSpiders lists credential ID RAJ-J-18/149 without a public credential link. These are source-matched links, not a claim of independent issuer verification. LinkedIn redirect wrappers were replaced with their exact destination URLs.

All 69 LinkedIn skill entries map to 59 normalized labels, merging aliases such as python/Python and nodej/Node.js. Existing résumé skills are preserved, resulting in 80 displayed labels across eight categories.

LinkedIn is used for current titles and dates where it differs from the résumé:

- Innominds: Software Engineer, February 2021–March 2022; Senior Software Engineer, April 2022–present.
- BeMiraki starts December 2018 (résumé says November).
- Inode ends June 2018 (résumé says July).
- Education lists October 2016 (résumé says 2017).

BeMiraki's current LinkedIn entry describes an internal delivery/sales portal; additional clothing-commerce responsibilities from the résumé are identified separately within its contribution details. Public professional content was used; recruiter-only settings, messages, analytics, and other account-only information were excluded.

## Behavior and validation

Content, navigation, and native project/certificate disclosures work without JavaScript. Project filters progressively enhance the page. Animations respect reduced-motion preferences.

The contact form sends submissions through FormSubmit to `mdyaseenferoz@gmail.com`; no custom domain or mail API key is needed.

A portfolio chat widget sends questions to `api/chat.mjs`, a Node.js AWS Lambda handler that calls Amazon Bedrock using the Converse API. The browser contains only the endpoint path; AWS credentials and access remain server-side. The widget scrolls its message history independently and scrolls each new reply into view.

### Configure Amazon Bedrock chat

The backend supports an Amazon Bedrock bearer API key for local exploration through the server-only `AWS_BEARER_TOKEN_BEDROCK` environment variable. Never put the key in the site, browser JavaScript, chat messages, or a committed file. For production, prefer the Lambda's IAM execution role; AWS recommends short-term keys or IAM roles for production instead of long-term keys.

1. In AWS, choose a region where your account has access to an Amazon Bedrock chat model. Enable/request model access if the console requires it. The default is `amazon.nova-micro-v1:0` in `us-east-1`; set `BEDROCK_MODEL_ID` and `AWS_REGION` if you select another model/region.
2. For local development, install Node.js 20+ and run `npm install`. Copy `.env.example` to `.env`, set the region/model values, and if using a Bedrock bearer API key, add it as `AWS_BEARER_TOKEN_BEDROCK=...` (do not leave an empty assignment). `.env` is git-ignored. With VS Code Live Server on `http://127.0.0.1:5500`, keep `ALLOWED_ORIGIN=http://127.0.0.1:5500`, then run `npm run chat:local`; the page automatically routes local `/api/chat` requests to port 8787. If your local site uses a different origin, change `ALLOWED_ORIGIN` to match it. The Bedrock API key must be valid for the configured region and model. To use AWS CLI profile credentials instead, leave the bearer variable absent; the handler then uses IAM/SigV4 and needs `bedrock:InvokeModel` permission on the model.
3. For production, the GitHub Actions workflow deploys the [SAM template](template.yaml) and connects the returned API URL to the Pages artifact when `AWS_ROLE_ARN`, `AWS_SAM_BUCKET`, and `AWS_CLOUDFORMATION_ROLE_ARN` are configured in repository Actions variables. The Lambda uses its IAM role for `bedrock:InvokeModel`; no Bedrock key is placed in the page. The template applies API Gateway throttling and a DynamoDB-backed daily question limit.
4. Keep the chat endpoint HTTPS-only in production. The handler limits message count/length, restricts origins when configured, and never returns AWS error details to visitors. Inspect AWS CloudWatch logs and Bedrock usage after a live smoke check.

The assistant is limited to Yaseen's career, education, skills, projects, and contact details. It answers in first person using verified facts, while the widget identifies it as an AI assistant rather than Yaseen typing live. It is capped at 220 generated tokens per answer. Visitors get 12 questions per source IP per UTC day; after that, they can share their name, email, and phone number with explicit consent to unlock up to 12 more questions that day. Those details are emailed to Yaseen through FormSubmit and are not sent to Bedrock or stored in DynamoDB. A daily hash of the source IP is used as the DynamoDB key; the table expires those quota records automatically. Visitors sharing a network also share this limit, and all visitors can return the next day.

### Configure contact email delivery

The contact form posts to FormSubmit's hosted AJAX endpoint and sends notifications to `mdyaseenferoz@gmail.com`. It needs no purchased domain, API key, or mail backend in this repository. The `box` email template formats submissions, the visitor's email is used for replies, and a honeypot plus FormSubmit's CAPTCHA filtering help reduce spam. On the first live submission, FormSubmit sends an activation email to the recipient; click its confirmation link once to activate delivery. The endpoint sends directly from static GitHub Pages, so later website pushes publish the form changes automatically. See [FormSubmit's setup guide](https://formsubmit.co/), [AJAX guide](https://formsubmit.co/ajax-documentation), and [email template examples](https://formsubmit.co/email-templates).

### Make the AI deploy on each push

The existing GitHub Pages workflow publishes the site on every push to `main`. GitHub Pages cannot run the Bedrock handler itself; the chat calls AWS Lambda and API Gateway. The workflow now also deploys the Lambda on each push after AWS credentials are connected, then injects the API URL into the published copy of `index.html`.

One-time AWS setup:

1. In AWS Console, open **CloudShell** in `us-east-1` and run `sam pipeline bootstrap --stage prod --region us-east-1 --permissions-provider oidc --oidc-provider github-actions --oidc-provider-url https://token.actions.githubusercontent.com --oidc-client-id sts.amazonaws.com --github-org yaseenferoz --github-repo yaseen-feroz --deployment-branch main`. Confirm the resource summary. SAM creates the GitHub OIDC pipeline role, a CloudFormation deployment role, and an S3 artifact bucket; if the GitHub OIDC provider already exists, SAM reuses it. Do not save the empty inline policy from the IAM role wizard.
2. Copy the role ARN, artifact bucket name, and CloudFormation role ARN from the bootstrap output. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and add `AWS_ROLE_ARN`, `AWS_SAM_BUCKET`, and `AWS_CLOUDFORMATION_ROLE_ARN`. Optionally set `AWS_REGION` (default `us-east-1`) and `BEDROCK_MODEL_ID` (default `amazon.nova-micro-v1:0`; for the US Nova 2 Lite inference profile, use `us.amazon.nova-2-lite-v1:0`).
3. Ensure Bedrock model access is enabled in that region. Push to `main`; Actions deploys the backend, writes the returned API URL into the Pages artifact, and publishes the site. After this one-time setup, normal code pushes update both the website and AI backend automatically.

If any of those three required Actions variables is missing, the Pages workflow still publishes the static site but skips the AWS deployment; the hosted chatbot will not work until AWS is connected. Locally, copy `.env.example` to `.env` and run `npm run chat:local` for the chat endpoint. The Resend key previously posted in chat should be revoked; this setup no longer uses Resend. GitHub documents [Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), and AWS documents [SAM pipeline bootstrap](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-pipeline-bootstrap.html) and [GitHub Actions OIDC federation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html).

Verified JavaScript syntax, exact certification-link parity, complete skill mapping, project counts, local assets, section links, unique IDs, and major HTML section structure. Project filter checks cover all categories, archive visibility, counters, and reset behavior. The certificate section and its expanded links were visually checked in the user's Chrome preview. Mobile layouts are implemented but have not been visually verified in this pass.
