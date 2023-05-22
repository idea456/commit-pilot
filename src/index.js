import { ChatGPTUnofficialProxyAPI } from "chatgpt";
import simpleGit from "simple-git";
import ora from "ora";
import prompts from "prompts";
import chalk from "chalk";
import fs from "fs";
import dotenv from "dotenv";
import { exec } from "child_process";
import util from "node:util";

const MAX_MESSAGE_LENGTH = 2048 * 2;
const git = simpleGit();
const execute = util.promisify(exec);

const logError = (msg) => console.log(chalk.red.bold(msg));

async function authenticateApi(regenerate = false) {
    loadEnvFile();
    let token = process.env.OPENAI_ACCESS_TOKEN;
    if (!token || regenerate) {
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
    return api;
}

async function sendMessage(message) {
    return await api.sendMessage(message);
}

async function getLatestDiff() {
    const { stdout, stderr } = await execute("git diff --staged");
    if (stdout && !stderr) {
        return stdout;
    } else if (!stdout && !stderr) {
        return "";
    } else {
        throw new Error(stderr);
    }
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
    let i = lines.findIndex((line) => line.includes(name));

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
    let api = await authenticateApi();
    let diff = await getLatestDiff();
    if (diff.length === 0) {
        logError("No staged files present.");
        return;
    }
    let should_regenerate = true;
    let should_reauthenticate = false;
    const has_exceeded_length = hasExceededMessageLength(diff);

    if (has_exceeded_length) diff = new Buffer(diff).toString("base64");

    while (should_regenerate || should_reauthenticate) {
        if (should_reauthenticate) {
            api = await authenticateApi(true);
            should_reauthenticate = false;
        }
        const spinner = ora("Generating commit message...").start();
        let res = "";
        try {
            if (has_exceeded_length) {
                // res = await api.sendMessage(
                //     `Perform the following steps:\n1. Decode this base64 string: ${diff}\n2. Reply to this message with a one line commit message with all lowercase letters, based on that diff as a reference.`,
                // );
                spinner.stop();
                logError(
                    "Unable to generate commit message, changes are too large.",
                );
                return;
            } else {
                res = await api.sendMessage(
                    `Provide a one line commit message with all lowercase letters, based on this diff as a reference:\n${diff}`,
                );
            }
        } catch (err) {
            spinner.stop();
            if (
                err?.statusCode === 413 &&
                err?.statusText === "Payload Too Large"
            ) {
                logError(
                    "Unable to generate commit message, changes are too large.",
                );
                return;
            } else if (err?.statusCode === 401) {
                logError("Access token has expired. Reauthenticating...");
                process.env.OPENAI_ACCESS_TOKEN = undefined;
                should_reauthenticate = true;
                continue;
            }
            console.log(err);
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
                    await git.commit(msg);
                } catch (err) {
                    console.log(err);
                }
            }
            should_regenerate = false;
        }
    }
}

(async function () {
    await main();
})();
