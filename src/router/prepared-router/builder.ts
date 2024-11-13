import type { PreparedMatch, Routes } from './router'

const variables = {
  matchResult: 'matchResult',
  emptyParams: 'emptyParams',
  pathParts: 'pathParts',
}

export function buildPreparedMatch<T>(routes: Routes<T>): PreparedMatch {
  return new Function(
    'method',
    'path',
    `return (() => {
        const ${variables.matchResult} = [];
        const ${variables.emptyParams} = Object.create(null);

        ${buildConditions(routes)}

        ${variables.matchResult}.sort((a, b) => a[0] - b[0]);   

        return ${variables.matchResult};
      })()`
  ) as PreparedMatch
}

// all fix and normalizer
function buildConditions<T>(routes: Routes<T>): string {

}
