import { Octokit } from '@octokit/rest';
import { config } from '../../config/env.js';

let instance: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!instance) {
    instance = new Octokit({ auth: config.GITHUB_TOKEN });
  }
  return instance;
}
