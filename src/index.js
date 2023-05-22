import { ChatGPTUnofficialProxyAPI } from "chatgpt";
import simpleGit from "simple-git";
import ora from "ora";
import prompts from "prompts";
import chalk from "chalk";
import fs from "fs";
import dotenv from "dotenv";

const git = simpleGit();

async function getLatestDiff() {
    let raw_diff;
    await git.diff([`@~~..@~`], (err, diff) => {
        if (err) {
            console.error(err);
            return;
        }
        raw_diff = diff;
    });
    return JSON.stringify(raw_diff);
}

function loadEnvFile() {
    if (!fs.existsSync(".env")) {
        fs.writeFileSync(".env", "");
    }
    dotenv.config();
}

function setEnv(name, value) {
    const envFile = fs.readFileSync(".env", "utf8");
    const lines = envFile.split("\n");

    let i = -1;
    lines.forEach((line, index) => {
        if (line.startsWith(`${name}=`)) index = i;
    });

    if (i !== -1) {
        lines[i] = `${name}=${value}`;
    } else {
        lines.push(`${name}=${value}`);
    }
    fs.writeFileSync(".env", lines.join("\n"));
}

async function main() {
    loadEnvFile();
    let token = process.env.OPENAI_ACCESS_TOKEN;
    if (!token) {
        console.log("You are currently not authenticated.");
        const { accessToken } = await prompts([
            {
                type: "password",
                name: "accessToken",
                message: `Please visit this link ${chalk.bold(
                    "https://chat.openai.com/api/auth/session",
                )} and paste the accessToken here: `,
            },
        ]);
        token = accessToken;
        setEnv("OPENAI_ACCESS_TOKEN", accessToken);
    }

    const api = new ChatGPTUnofficialProxyAPI({
        accessToken: token, // visit https://chat.openai.com/api/auth/session to get access token
        apiReverseProxyUrl: "https://ai.fakeopen.com/api/conversation",
    });

    const diff = await getLatestDiff();
    let should_regenerate = true;

    while (should_regenerate) {
        const spinner = ora("Generating commit message...").start();
        const res = await api.sendMessage(
            `Provide a one line commit message with all lowercase letters, with the format '(feat|fix|chore): (commit message)', labelling this commit as either feat, fix or chore, using this diff as a reference:\n${diff}`,
        );
        spinner.stop();

        const { respond } = await prompts({
            type: "select",
            name: "respond",
            message: `Generated message: ${chalk.yellow(
                res.text,
            )}\nCommit with the following message?`,
            choices: [
                { title: "Yes", value: "y" },
                { title: "No", value: "n" },
                { title: "Regenerate message", value: "r" },
            ],
        });

        let msg = "";
        if (respond === "y") {
            msg = res.text;
        } else if (respond === "n") {
            const { commit_message } = await prompts({
                type: "text",
                name: "commit_message",
                message: "Enter your commit message: ",
            });
            msg = commit_message;
        }

        if (respond !== "r") {
            try {
                spinner.start("Commiting with message...");
                await git.commit(msg);
                should_regenerate = false;
                spinner.stop();
            } catch (err) {
                console.log(err);
            }
        }
    }
}

(async function () {
    await main();
})();
