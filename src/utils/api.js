const FormData = require('form-data');
const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const request = require('request');
const tmp = require('tmp');
const { parse: parseUrl } = require('url');
const util = require('util');

const {
  FRAGMENTS_PORTLET_ID,
  PORTLET_FILE_REPOSITORY,
} = require('./constants');
const { default: writeZip } = require('./write-zip');

module.exports = {
  _host: '',
  _basicAuthToken: '',

  /**
   * @type {import('../../types').IOauthToken}
   */
  _oauthToken: {
    accessToken: '',
    refreshToken: '',
    expirationDate: new Date('1991-1-1'),
  },

  /**
   * Initializes api
   * @param {string} host
   * @param {string} basicAuthToken
   * @param {import('../../types').IServerOauthToken} [oauthToken]
   */
  init(host, basicAuthToken, oauthToken) {
    this._host = host;
    this._basicAuthToken = basicAuthToken;

    if (oauthToken) {
      const expirationDate = new Date();
      expirationDate.setSeconds(
        expirationDate.getSeconds() + oauthToken.expires_in - 60
      );

      this._oauthToken = {
        accessToken: oauthToken.access_token,
        refreshToken: oauthToken.refresh_token,
        expirationDate,
      };
    }
  },

  /**
   * @param {'GET' | 'POST'} method
   * @param {string} url
   * @param {object} [options={}]
   * @return {Promise<object|string>}
   */
  async request(method, url, options = {}) {
    if (process.env.NODE_ENV === 'test') {
      throw new Error(
        `Requests not available during testing (${method} ${url})`
      );
    }

    const promiseRequest = util.promisify(request);
    const opts = {
      method,
      url: `${this._host}${url}`,
      ...options,
    };

    const response = await promiseRequest(opts, undefined);

    return this.parseResponse(response);
  },

  /**
   * @param {object} response
   * @param {number} response.statusCode
   * @param {string} response.body
   * @return {object|string}
   */
  parseResponse(response) {
    /** @type {object|string} */
    let responseBody = response.body;

    if (typeof responseBody === 'string') {
      try {
        responseBody = JSON.parse(response.body);
      } catch (_) {
        // If responseBody is not an object
        // we silently ignore
      }
    }

    if (typeof responseBody === 'object') {
      if (responseBody.error && responseBody.error.type) {
        const errorMessage = responseBody.error.message;
        let message = '';

        switch (responseBody.error.type) {
          case 'com.liferay.fragment.exception.FragmentEntryNameException':
            message = `Error in fragment.json: ${errorMessage}`;
            break;
          case 'com.liferay.fragment.exception.FragmentCollectionNameException':
            message = `Error in collection.json: ${errorMessage}`;
            break;
          case 'com.liferay.fragment.exception.FragmentEntryConfigurationException':
            message = `Error in fragment configuration:\n${errorMessage}`;
            break;
          case 'com.liferay.fragment.exception.DuplicateFragmentEntryKeyException':
            message =
              'Error in fragment.json: There is already a fragment with the same name';
            break;
          default:
            message = errorMessage;
            break;
        }

        if (message) {
          throw new Error(message);
        }
      }

      if ('exception' in responseBody) {
        throw new Error(responseBody.exception);
      }

      if ('error' in responseBody) {
        throw new Error(responseBody.error);
      }
    }

    if (response.statusCode >= 400) {
      throw new Error(`${response.statusCode} ${response.body}`);
    }

    return responseBody;
  },

  /**
   * @param {string} url
   * @param {object} [queryParameters = {}]
   * @param {object} [options={}]
   * @return {Promise<object|string>}
   */
  get(url, queryParameters = {}, options = {}) {
    const queryString = Object.entries(queryParameters)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return this.request('GET', `${url}?${queryString}`, options);
  },

  /**
   * @param {string} url
   * @param {object} [form={}]
   * @param {object} [options={}]
   * @return {Promise<object|string>}
   */
  postForm(url, form, options) {
    return this.request('POST', url, { form, ...options });
  },

  /**
   * @param {string} url
   * @param {object} [formData={}]
   * @param {object} [options={}]
   * @return {Promise<object|string>}
   */
  postFormData(url, formData = {}, options = {}) {
    return this.request('POST', url, { formData, ...options });
  },

  /**
   * @param {string} username
   * @param {string} password
   * @return {Promise<import('../../types').IServerOauthToken>}
   */
  getOAuthToken(username, password) {
    return this.postForm('/o/oauth2/token', {
      grant_type: 'password', // eslint-disable-line camelcase
      client_id: 'FragmentRenderer', // eslint-disable-line camelcase
      username,
      password,
    });
  },

  /**
   * Tries to refresh existing oauth2Token.
   * It existing token is invalid it sets it to null.
   */
  async refreshOAuthToken() {
    if (this._oauthToken.expirationDate < new Date()) {
      try {
        const oauthToken = await this.postForm('/o/oauth2/token', {
          client_id: 'FragmentRenderer', // eslint-disable-line camelcase
          grant_type: 'refresh_token', // eslint-disable-line camelcase
          refresh_token: this._oauthToken.refreshToken, // eslint-disable-line camelcase
        });

        this.init(this._host, this._basicAuthToken, oauthToken);
      } catch (_) {
        this._oauthToken = {
          accessToken: '',
          refreshToken: '',
          expirationDate: new Date('1991-1-1'),
        };
      }
    }
  },

  /**
   * Checks authentication with both BasicAuth and OAuth2
   * @return {Promise<void>}
   */
  async checkAuthentication() {
    await this.postFormData(
      '/api/jsonws/user/get-current-user',
      {},
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );

    if (this._oauthToken.accessToken) {
      await this.postFormData(
        '/api/jsonws/user/get-current-user',
        {},
        {
          headers: { Authorization: `Bearer ${this._oauthToken.accessToken}` },
        }
      );
    }
  },

  /**
   * @return {Promise<import('../../types').ICompany[]>}
   */
  getCompanies() {
    return this.postFormData(
      '/api/jsonws/company/get-companies',
      {},
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} companyId
   * @return {Promise<import('../../types').ISiteGroup[]>}
   */
  getStagingGroups(companyId) {
    return this.postFormData(
      `/api/jsonws/group/get-groups/company-id/${companyId}/parent-group-id/0/site/false`,
      {},
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} companyId
   * @return {Promise<import('../../types').ISiteGroup[]>}
   */
  getSiteGroups(companyId) {
    return this.postFormData(
      `/api/jsonws/group/get-groups/company-id/${companyId}/parent-group-id/0/site/true`,
      {},
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} groupId
   * @param {string} fragmentCollectionId
   * @param {string} [name]
   * @return {Promise<import('../../types').IServerFragment[]>}
   */
  getFragmentEntries(groupId, fragmentCollectionId, name) {
    /**
     * @type {import('../../types').IGetFragmentEntriesOptions}
     */
    const options = {
      groupId,
      fragmentCollectionId,
      status: 0,
      start: -1,
      end: -1,
    };

    if (name) {
      options.name = name;
    }

    return this.postFormData(
      '/api/jsonws/fragment.fragmententry/get-fragment-entries',
      options,
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} groupId
   * @param {string} fragmentCollectionId
   * @return {Promise<import('../../types').IServerFragmentComposition[]>}
   */
  getFragmentCompositions(groupId, fragmentCollectionId) {
    const options = {
      groupId,
      fragmentCollectionId,
      start: -1,
      end: -1,
    };

    return this.postFormData(
      '/api/jsonws/fragment.fragmentcomposition/get-fragment-compositions',
      options,
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    ).catch(() => {
      return [];
    });
  },

  /**
   * @param {string} groupId
   * @param {string} [name]
   * @return {Promise<import('../../types').IServerCollection[]>}
   */
  getFragmentCollections(groupId, name) {
    /** @type {{ groupId: string, name?: string, start: number, end: number }} */
    const options = {
      groupId,
      start: -1,
      end: -1,
    };

    if (name) {
      options.name = name;
    }

    return this.postFormData(
      '/api/jsonws/fragment.fragmentcollection/get-fragment-collections',
      options,
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} fragmentCollectionId
   * @param {string} name
   * @param {string} [description='']
   * @return {Promise<''>}
   */
  updateFragmentCollection(fragmentCollectionId, name, description = '') {
    return this.postFormData(
      '/api/jsonws/fragment.fragmentcollection/update-fragment-collection',
      {
        fragmentCollectionId,
        description,
        name,
      },
      {
        headers: {
          Authorization: `Basic ${this._basicAuthToken}`,
        },
      }
    );
  },

  /**
   * @param {string} groupId
   * @param {string} fragmentCollectionKey
   * @param {string} name
   * @param {string} [description='']
   * @return {Promise<''>}
   */
  addFragmentCollection(
    groupId,
    fragmentCollectionKey,
    name,
    description = ''
  ) {
    return this.postFormData(
      '/api/jsonws/fragment.fragmentcollection/add-fragment-collection',
      {
        groupId,
        fragmentCollectionKey,
        name,
        description,
      },
      {
        headers: {
          Authorization: `Basic ${this._basicAuthToken}`,
        },
      }
    );
  },

  /**
   * @param {string} fragmentEntryId
   * @param {{ status: number, name: string, html: string, css: string, js: string,  configuration: string, previewFileEntryId?: number}} data
   */
  updateFragmentEntry(
    fragmentEntryId,
    { configuration, css, html, js, name, previewFileEntryId = 0, status }
  ) {
    return this.postFormData(
      '/api/jsonws/fragment.fragmententry/update-fragment-entry',
      {
        fragmentEntryId,
        status,
        name,
        html,
        css,
        js,
        configuration,
        previewFileEntryId,
      },
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {Buffer} thumbnail
   * @param {string} groupId
   * @param {string} fragmentEntryKey
   * @param {string} previewFileEntryId
   */
  async uploadThumbnail(
    thumbnail,
    groupId,
    fragmentEntryKey,
    previewFileEntryId = '0'
  ) {
    const bytes = JSON.stringify([...thumbnail]);
    const filename = `${groupId}_${fragmentEntryKey}_thumbnail`;

    let fileEntry;

    const repository = await this.postFormData(
      '/api/jsonws/repository/get-repository',
      {
        groupId,
        portletId: FRAGMENTS_PORTLET_ID,
      },
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    )
      .then((response) => response)
      .catch(async () => {
        const classNameId = await this.postFormData(
          '/api/jsonws/classname/fetch-class-name',
          {
            value: PORTLET_FILE_REPOSITORY,
          },
          {
            headers: { Authorization: `Basic ${this._basicAuthToken}` },
          }
        ).then((response) => response.classNameId);

        return this.postFormData(
          '/api/jsonws/repository/add-repository',
          {
            groupId,
            classNameId,
            parentFolderId: 0,
            name: FRAGMENTS_PORTLET_ID,
            description: '',
            portletId: FRAGMENTS_PORTLET_ID,
            typeSettingsProperties: JSON.stringify({}),
          },
          {
            headers: { Authorization: `Basic ${this._basicAuthToken}` },
          }
        ).then((response) => response);
      });

    if (Number(previewFileEntryId) > 0) {
      fileEntry = this.postFormData(
        '/api/jsonws/dlapp/update-file-entry',
        {
          fileEntryId: previewFileEntryId,
          sourceFileName: filename,
          mimeType: mime.lookup(filename),
          title: filename,
          description: '',
          changeLog: '',
          dlVersionNumberIncrease: 'NONE',
          bytes,
        },
        {
          headers: { Authorization: `Basic ${this._basicAuthToken}` },
        }
      ).then((response) => response);
    } else {
      fileEntry = this.postFormData(
        '/api/jsonws/dlapp/add-file-entry',
        {
          repositoryId: repository.repositoryId,
          folderId: repository.dlFolderId,
          sourceFileName: filename,
          mimeType: mime.lookup(filename),
          title: filename,
          description: '',
          changeLog: '',
          bytes,
        },
        {
          headers: { Authorization: `Basic ${this._basicAuthToken}` },
        }
      ).then((response) => response.fileEntryId);
    }

    return fileEntry;
  },

  /**
   * @param {string} groupId
   * @param {string} fragmentCollectionId
   * @param {string} fragmentEntryKey
   * @param {{ status: number, name: string, type: number, html: string, css: string, js: string,  configuration: string, previewFileEntryId?: number}} data
   */
  addFragmentEntry(
    groupId,
    fragmentCollectionId,
    fragmentEntryKey,
    { configuration, css, html, js, name, previewFileEntryId = 0, status, type }
  ) {
    return this.postFormData(
      '/api/jsonws/fragment.fragmententry/add-fragment-entry',
      {
        fragmentCollectionId,
        fragmentEntryKey,
        groupId,
        status,
        name,
        type,
        html,
        css,
        js,
        configuration,
        previewFileEntryId,
      },
      {
        headers: { Authorization: `Basic ${this._basicAuthToken}` },
      }
    );
  },

  /**
   * @param {string} groupId
   * @return {Promise<Buffer>}
   */
  async exportZip(groupId) {
    await this.refreshOAuthToken();

    return new Promise((resolve, reject) => {
      request(
        `${this._host}/c/portal/layout_page_template/export_layout_page_template_entries?groupId=${groupId}`,
        {
          headers: { Authorization: `Bearer ${this._oauthToken.accessToken}` },
          encoding: null,
        },
        (error, response, body) => {
          if (error) {
            reject(error);
          }

          resolve(body);
        }
      );
    });
  },

  /**
   * @param {JSZip} zip
   * @param {string} groupId
   */
  async importZip(zip, groupId) {
    await this.refreshOAuthToken();

    const formData = new FormData();
    const tmpZip = tmp.fileSync();

    await writeZip(zip, tmpZip.name);

    formData.append('file', fs.createReadStream(tmpZip.name));
    formData.append('groupId', groupId);

    const params = parseUrl(
      `${this._host}/c/portal/fragment/import_fragment_entries`
    );

    const options = {
      host: params.hostname,
      path: params.pathname,
      port: params.port,
      protocol: params.protocol,
      headers: { Authorization: `Bearer ${this._oauthToken.accessToken}` },
      method: 'POST',
    };

    return new Promise((resolve, reject) => {
      formData.submit(options, (error, response) => {
        tmpZip.removeCallback();

        if (error) {
          reject(error);
        } else if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          reject(new Error('statusCode=' + response.statusCode));
        } else {
          /** @type {any[]} */
          let body = [];

          response.on('data', (chunk) => {
            body.push(chunk);
          });

          response.on('end', () => {
            try {
              body = JSON.parse(Buffer.concat(body).toString());
            } catch (e) {
              reject(e);

              return;
            }

            resolve(body);
          });
        }
      });
    });
  },

  /**
   * @param {string} groupId
   * @param {object} definition
   */
  async renderCompositionPreview(groupId, definition) {
    return this.renderPageDefinitionPreview(groupId, {
      pageElement: definition,
    });
  },

  /**
   * @param {string} groupId
   * @param {string} html
   * @param {string} css
   * @param {string} js
   * @param {string} configuration
   */
  // eslint-disable-next-line max-params
  async renderFragmentPreview(groupId, html, css, js, configuration) {
    await this.refreshOAuthToken();

    return this.postFormData(
      '/c/portal/fragment/render_fragment_entry',
      {
        groupId,
        html,
        css,
        js,
        configuration,
      },
      {
        headers: { Authorization: `Bearer ${this._oauthToken.accessToken}` },
      }
    );
  },

  /**
   * @param {string} groupId
   * @param {object} definition
   */
  async renderPageDefinitionPreview(groupId, definition) {
    return this.request(
      'POST',
      `/o/headless-admin-content/v1.0/sites/${groupId}/page-definitions/preview`,
      {
        body: definition,
        headers: {
          Accept: 'text/html',
          Authorization: `Basic ${this._basicAuthToken}`,
        },
        json: true,
      }
    );
  },
};
