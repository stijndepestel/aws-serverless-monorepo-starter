#!/usr/bin/env node
import { createRequire } from 'module';
import fs from 'fs/promises';
import winston from 'winston';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { spawnSync } from 'child_process';
import inquirer from 'inquirer';

const require = createRequire(import.meta.url);
const {
  repository: { url: repoUrl },
} = require('../package.json');

const TEMPLATE_STARTER_TEMP_FOLDER = './.template-starter-temp';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  format: winston.format.combine(winston.format.simple(), winston.format.cli()),
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
  },
});

const prompt = inquirer.createPromptModule();

// Needs Git v2.22

const exec = (command, showOutput = false) => {
  const [cmd, ...args] = command.split(' ');
  const {
    status,
    signal,
    error,
    stdout: output,
    stderr: errOutput,
  } = spawnSync(cmd, args, { stdio: showOutput ? 'inherit' : 'pipe' });

  if (status !== 0) {
    throw new Error(JSON.stringify({ status, signal, error, log: errOutput.toString() }));
  }

  return showOutput || output.toString();
};

const removeTemplateGitDir = () => fs.rm(TEMPLATE_STARTER_TEMP_FOLDER, { recursive: true });

const setup = async ({ repo, branch }) => {
  logger.info(`Using branch ${branch} from repository ${repo} as a template`);
  exec('git init');
  try {
    const currentBranch = exec('git branch --show-current').trim();
    exec(`git remote add -t ${branch} template-starter ${repo}`);
    exec(`git pull --no-commit --depth 1 template-starter ${branch}:${currentBranch}`);
  } finally {
    exec(`git remote remove template-starter`);
  }
  logger.info(
    "Git has been initialized (if it was not already) and the template has been downloaded. Please refer to the template's README.MD for next steps.",
  );
};

const getRepoBranchNames = async (repo) => {
  try {
    exec(`git clone --bare ${repo} ${TEMPLATE_STARTER_TEMP_FOLDER}`);
    const branches = exec(`git --git-dir=${TEMPLATE_STARTER_TEMP_FOLDER} branch -l --format='%(refname)'`)
      .split('\n')
      .map((ref) => ref.replace(/'/g, ''))
      .filter((ref) => ref.length > 0)
      .map((ref) => ref.replace(/^refs\/heads\//, ''))
      .filter((ref) => !(repo === repoUrl && ref === 'main')); // main branch holds starter execution code, no templates.

    return branches;
  } finally {
    // cleanup
    await removeTemplateGitDir();
  }
};

const askSetupArgs = async () => {
  logger.info('Welcome to the guided setup of your new node project.');
  const defaultRepoBranches = await getRepoBranchNames(repoUrl);
  const { template } = await prompt([
    {
      type: 'list',
      name: 'template',
      message: 'Which template do you want to use?',
      choices: [...defaultRepoBranches, 'custom'],
    },
  ]);
  if (template !== 'custom') {
    return {
      repo: repoUrl,
      branch: template,
    };
  }

  const { repo } = await prompt([
    {
      type: 'input',
      name: 'repo',
      message: 'Which repository should be used?',
    },
  ]);
  const customRepoBranches = await getRepoBranchNames(repo, true);
  const { customTemplate } = await prompt([
    {
      type: 'list',
      name: 'customTemplate',
      message: 'Which template do you want to use of your custom repository?',
      choices: customRepoBranches,
    },
  ]);
  return {
    repo,
    branch: customTemplate,
  };
};

const script = async (args) => {
  const { guided } = args;
  if (guided) {
    const setupArgs = await askSetupArgs();
    await setup(setupArgs);

    return;
  }
  logger.info('Coming soon...');
};

const options = yargs(hideBin(process.argv))
  .option('guided', {
    description: 'Whether to use a guided deploy. Bypasses all other supplied arguments.',
    boolean: true,
    default: true,
    alias: 'g',
  })
  .alias('h', 'help')
  .alias('v', 'version').argv;

script(options).catch(logger.error);
