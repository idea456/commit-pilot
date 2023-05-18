import { ChatGPTUnofficialProxyAPI } from "chatgpt";
import simpleGit from "simple-git";
import ora from "ora";
import chalk from "chalk";
import readline from "readline";

const git = simpleGit();

async function getLatestDiff() {
  let raw_diff;
  await git.diff([`@~..@`], (err, diff) => {
    if (err) {
      console.error(err);
      return;
    }
    raw_diff = diff;
  });
  return JSON.stringify(raw_diff);
}

async function main() {
  const api = new ChatGPTUnofficialProxyAPI({
    accessToken: "", // visit https://chat.openai.com/api/auth/session to get access token
    apiReverseProxyUrl: "https://ai.fakeopen.com/api/conversation",
  });

  const diff = await getLatestDiff();
  const spinner = ora("Generating commit message...").start();
  const res = await api.sendMessage(
    `Provide a one line commit message with all lowercase letters, with the format '(feat|fix|chore): (commit message)', labelling this commit as either feat, fix or chore, using this diff as a reference:\n${diff}`
  );
  spinner.stop();
  const line = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  line.question(
    `Generated message: ${chalk.bold(
      res.text
    )}\nCommit with the following message? (y/n): `,
    async (respond) => {
      if (respond === "y") {
        spinner.start("Commiting with the generated message...");
        await git.commit(res.text);
        spinner.stop("done");
      } else if (respond === "n") {
        console.log("Aborting...");
      }
      line.close();
    }
  );
}

(async function () {
  await main();
})();
