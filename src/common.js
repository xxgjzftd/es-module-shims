export const hasSelf = typeof self !== 'undefined';

const envGlobal = hasSelf ? self : global;
export { envGlobal as global };

export const resolvedPromise = Promise.resolve();

export let baseUrl;

export function createBlob (source, type = 'text/javascript') {
  return URL.createObjectURL(new Blob([source], { type }));
}

export const hasDocument = typeof document !== 'undefined';

// support browsers without dynamic import support (eg Firefox 6x)
export let supportsDynamicImport = false;
export let supportsJsonAssertions = false;
export let supportsCssAssertions = false;
export let dynamicImport;
try {
  dynamicImport = (0, eval)('u=>import(u)');
  supportsDynamicImport = true;
}
catch (e) {
  if (hasDocument) {
    let err;
    self.addEventListener('error', e => err = e.error);
    dynamicImport = blobUrl => {
      const topLevelBlobUrl = createBlob(
        `import*as m from'${blobUrl}';self._esmsi=m;`
      );
      const s = document.createElement('script');
      s.type = 'module';
      s.src = topLevelBlobUrl;
      document.head.appendChild(s);
      return new Promise((resolve, reject) => {
        s.addEventListener('load', () => {
          document.head.removeChild(s);
          if (self._esmsi) {
            resolve(self._esmsi, baseUrl);
            self._esmsi = null;
          }
          else {
            reject(err);
          }
        });
      });
    };
  }
}

export let supportsImportMeta = false;
export let supportsImportMaps = false;

export const featureDetectionPromise = Promise.all([
  dynamicImport(createBlob('import"data:text/css,{}"assert{type:"css"}')).then(() => supportsCssAssertions = true, () => {}),
  dynamicImport(createBlob('import"data:text/json,{}"assert{type:"json"}')).then(() => supportsJsonAssertions = true, () => {}),
  dynamicImport(createBlob('import.meta')).then(() => supportsImportMeta = true, () => {}),
  supportsDynamicImport && hasDocument && new Promise(resolve => {
    self._$s = v => {
      document.body.removeChild(iframe);
      if (v) supportsImportMaps = true;
      delete self._$s;
      resolve();
    };
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    // we use document.write here because eg Weixin built-in browser doesn't support setting srcdoc
    iframe.contentWindow.document.write(`<script type=importmap>{"imports":{"x":"data:text/javascript,"}}<${''}/script><script>import('x').then(()=>1,()=>0).then(v=>parent._$s(v))<${''}/script>`);
  })
]);

if (hasDocument) {
  const baseEl = document.querySelector('base[href]');
  if (baseEl)
    baseUrl = baseEl.href;
}

if (!baseUrl && typeof location !== 'undefined') {
  baseUrl = location.href.split('#')[0].split('?')[0];
  const lastSepIndex = baseUrl.lastIndexOf('/');
  if (lastSepIndex !== -1)
    baseUrl = baseUrl.slice(0, lastSepIndex + 1);
}

const backslashRegEx = /\\/g;
export function resolveIfNotPlainOrUrl (relUrl, parentUrl) {
  // strip off any trailing query params or hashes
  parentUrl = parentUrl && parentUrl.split('#')[0].split('?')[0];
  if (relUrl.indexOf('\\') !== -1)
    relUrl = relUrl.replace(backslashRegEx, '/');
  // protocol-relative
  if (relUrl[0] === '/' && relUrl[1] === '/') {
    return parentUrl.slice(0, parentUrl.indexOf(':') + 1) + relUrl;
  }
  // relative-url
  else if (relUrl[0] === '.' && (relUrl[1] === '/' || relUrl[1] === '.' && (relUrl[2] === '/' || relUrl.length === 2 && (relUrl += '/')) ||
      relUrl.length === 1  && (relUrl += '/')) ||
      relUrl[0] === '/') {
    const parentProtocol = parentUrl.slice(0, parentUrl.indexOf(':') + 1);
    // Disabled, but these cases will give inconsistent results for deep backtracking
    //if (parentUrl[parentProtocol.length] !== '/')
    //  throw new Error('Cannot resolve');
    // read pathname from parent URL
    // pathname taken to be part after leading "/"
    let pathname;
    if (parentUrl[parentProtocol.length + 1] === '/') {
      // resolving to a :// so we need to read out the auth and host
      if (parentProtocol !== 'file:') {
        pathname = parentUrl.slice(parentProtocol.length + 2);
        pathname = pathname.slice(pathname.indexOf('/') + 1);
      }
      else {
        pathname = parentUrl.slice(8);
      }
    }
    else {
      // resolving to :/ so pathname is the /... part
      pathname = parentUrl.slice(parentProtocol.length + (parentUrl[parentProtocol.length] === '/'));
    }

    if (relUrl[0] === '/')
      return parentUrl.slice(0, parentUrl.length - pathname.length - 1) + relUrl;

    // join together and split for removal of .. and . segments
    // looping the string instead of anything fancy for perf reasons
    // '../../../../../z' resolved to 'x/y' is just 'z'
    const segmented = pathname.slice(0, pathname.lastIndexOf('/') + 1) + relUrl;

    const output = [];
    let segmentIndex = -1;
    for (let i = 0; i < segmented.length; i++) {
      // busy reading a segment - only terminate on '/'
      if (segmentIndex !== -1) {
        if (segmented[i] === '/') {
          output.push(segmented.slice(segmentIndex, i + 1));
          segmentIndex = -1;
        }
      }

      // new segment - check if it is relative
      else if (segmented[i] === '.') {
        // ../ segment
        if (segmented[i + 1] === '.' && (segmented[i + 2] === '/' || i + 2 === segmented.length)) {
          output.pop();
          i += 2;
        }
        // ./ segment
        else if (segmented[i + 1] === '/' || i + 1 === segmented.length) {
          i += 1;
        }
        else {
          // the start of a new segment as below
          segmentIndex = i;
        }
      }
      // it is the start of a new segment
      else {
        segmentIndex = i;
      }
    }
    // finish reading out the last segment
    if (segmentIndex !== -1)
      output.push(segmented.slice(segmentIndex));
    return parentUrl.slice(0, parentUrl.length - pathname.length) + output.join('');
  }
}

/*
 * Import maps implementation
 *
 * To make lookups fast we pre-resolve the entire import map
 * and then match based on backtracked hash lookups
 *
 */
export function resolveUrl (relUrl, parentUrl) {
  return resolveIfNotPlainOrUrl(relUrl, parentUrl) || (relUrl.indexOf(':') !== -1 ? relUrl : resolveIfNotPlainOrUrl('./' + relUrl, parentUrl));
}

function resolveAndComposePackages (packages, outPackages, baseUrl, parentMap) {
  for (let p in packages) {
    const resolvedLhs = resolveIfNotPlainOrUrl(p, baseUrl) || p;
    let target = packages[p];
    if (typeof target !== 'string') 
      continue;
    const mapped = resolveImportMap(parentMap, resolveIfNotPlainOrUrl(target, baseUrl) || target, baseUrl);
    if (mapped) {
      outPackages[resolvedLhs] = mapped;
      continue;
    }
    targetWarning(p, packages[p], 'bare specifier did not resolve');
  }
}

export function resolveAndComposeImportMap (json, baseUrl, parentMap) {
  const outMap = { imports: Object.assign({}, parentMap.imports), scopes: Object.assign({}, parentMap.scopes) };

  if (json.imports)
    resolveAndComposePackages(json.imports, outMap.imports, baseUrl, parentMap, null);

  if (json.scopes)
    for (let s in json.scopes) {
      const resolvedScope = resolveUrl(s, baseUrl);
      resolveAndComposePackages(json.scopes[s], outMap.scopes[resolvedScope] || (outMap.scopes[resolvedScope] = {}), baseUrl, parentMap);
    }

  return outMap;
}

function getMatch (path, matchObj) {
  if (matchObj[path])
    return path;
  let sepIndex = path.length;
  do {
    const segment = path.slice(0, sepIndex + 1);
    if (segment in matchObj)
      return segment;
  } while ((sepIndex = path.lastIndexOf('/', sepIndex - 1)) !== -1)
}

function applyPackages (id, packages) {
  const pkgName = getMatch(id, packages);
  if (pkgName) {
    const pkg = packages[pkgName];
    if (pkg === null) return;
    if (id.length > pkgName.length && pkg[pkg.length - 1] !== '/')
      targetWarning(pkgName, pkg, "should have a trailing '/'");
    else
      return pkg + id.slice(pkgName.length);
  }
}

function targetWarning (match, target, msg) {
  console.warn("Package target " + msg + ", resolving target '" + target + "' for " + match);
}

export function resolveImportMap (importMap, resolvedOrPlain, parentUrl) {
  let scopeUrl = parentUrl && getMatch(parentUrl, importMap.scopes);
  while (scopeUrl) {
    const packageResolution = applyPackages(resolvedOrPlain, importMap.scopes[scopeUrl]);
    if (packageResolution)
      return packageResolution;
    scopeUrl = getMatch(scopeUrl.slice(0, scopeUrl.lastIndexOf('/')), importMap.scopes);
  }
  return applyPackages(resolvedOrPlain, importMap.imports) || resolvedOrPlain.indexOf(':') !== -1 && resolvedOrPlain;
}
