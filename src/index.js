import { ChatGPTUnofficialProxyAPI } from "chatgpt";
import simpleGit from "simple-git";
import ora from "ora";
import prompts from "prompts";
import chalk from "chalk";
import fs from "fs";
import dotenv from "dotenv";
import { exec } from "child_process";
import util from "node:util";

const MAX_MESSAGE_LENGTH = 2048;
const git = simpleGit();
const execute = util.promisify(exec);

async function getLatestDiff() {
    return new Promise((resolve) => {
        let raw_diff;
        const { stdout, err } = exec("git diff --staged");
        if (!err) {
            stdout.on("data", (chunk) => {
                raw_diff += chunk.toString();
            });
            stdout.on("end", () => {
                resolve(raw_diff);
            });
        }
    });
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

function hasExceededMessageLength(message) {
    const tokens = message.split(" ");
    if (tokens.length >= MAX_MESSAGE_LENGTH) {
        return true;
    }
    return false;
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

    let diff = await getLatestDiff();
    let should_regenerate = true;
    const has_exceeded_length = hasExceededMessageLength(diff);

    if (has_exceeded_length) diff = new Buffer(diff).toString("base64");

    while (should_regenerate) {
        const spinner = ora("Generating commit message...").start();
        let res = "";
        if (has_exceeded_length) {
            try {
                res = await api.sendMessage(
                    `Provide a one line commit message with all lowercase letters, based on this encoded base64 diff as a reference:\n${diff}`,
                );
            } catch (err) {
                if (
                    err?.statusCode === 413 &&
                    err?.statusText === "Payload Too Large"
                ) {
                    spinner.stop();
                    console.log(
                        chalk.red.bold(
                            "Unable to generate commit message, changes are too large.",
                        ),
                    );
                    return;
                }
                console.log(err);
            }
        } else {
            res = await api.sendMessage(
                `Provide a one line commit message with all lowercase letters, based on this diff as a reference:\n${diff}`,
            );
        }
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
            const should_skip_commit = process.argv.find(
                (arg) => arg === "--skip-commit",
            );
            if (!should_skip_commit) {
                try {
                    spinner.start("Commiting with message...");
                    await git.commit(msg);
                    spinner.stop();
                } catch (err) {
                    console.log(Object.keys(err));
                }
            }
            should_regenerate = false;
        }
    }
}

(async function () {
    await main();
})();
