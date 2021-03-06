import { IProject } from '../../types';
import compress from '../compress/compress';
import api from '../utils/api';
import {
  ADD_DEPLOYMENT_DESCRIPTOR_VAR,
  FRAGMENT_IMPORT_STATUS,
  PAGE_TEMPLATE_IMPORT_STATUS,
} from '../utils/constants';
import { log } from '../utils/log';
import getProjectContent from '../utils/project-content/get-project-content';
import importLegacy from './import-legacy';

interface ImportResult {
  name: string;
  errorMessage: string;
  status: string;
}

export default async function importProject(
  projectContent: IProject,
  groupId: string
): Promise<void> {
  log('Importing project...', { newLine: true });

  // Try to import using Struts action first

  try {
    const response = await api.importZip(
      await compress(projectContent, {
        [ADD_DEPLOYMENT_DESCRIPTOR_VAR]: false,
      }),
      groupId
    );

    if (response.error) {
      throw new Error('Zip import error');
    }

    if (
      (response.fragmentEntriesImportResult &&
        response.fragmentEntriesImportResult.length > 0) ||
      (response.pageTemplatesImportResult &&
        response.pageTemplatesImportResult.length > 0)
    ) {
      _logImportResults(
        response.fragmentEntriesImportResult || [],
        response.pageTemplatesImportResult || []
      );
    } else {
      log('Project imported', { level: 'success' });
    }
  } catch (_) {
    log('Zip file not generated, using legacy APIs', {
      level: 'error',
    });
    await importLegacy(projectContent, groupId);
  }
}

function _logImportResults(
  fragmentEntriesImportResults: ImportResult[],
  pageTemplatesImportResults: ImportResult[]
) {
  fragmentEntriesImportResults.forEach((result) => {
    switch (result.status) {
      case FRAGMENT_IMPORT_STATUS.IMPORTED: {
        log(`✔ Fragment ${result.name} imported`, { level: 'success' });

        break;
      }

      case FRAGMENT_IMPORT_STATUS.IMPORTED_DRAFT: {
        log(
          `↷ Fragment ${result.name} imported as draft due to the following errors`,
          {
            level: 'info',
          }
        );

        log(`ERROR: ${result.errorMessage}`, {
          level: 'error',
        });

        break;
      }

      case FRAGMENT_IMPORT_STATUS.INVALID: {
        log(
          `Fragment ${result.name} not imported due to the following errors`,
          {
            level: 'error',
          }
        );

        log(`ERROR: ${result.errorMessage}`, {
          level: 'error',
        });

        break;
      }

      default:
        break;
    }
  });

  pageTemplatesImportResults.forEach((result) => {
    switch (result.status) {
      case PAGE_TEMPLATE_IMPORT_STATUS.IMPORTED: {
        log(`✔ Page template ${result.name} imported`, {
          level: 'success',
        });

        break;
      }

      case PAGE_TEMPLATE_IMPORT_STATUS.IGNORED: {
        log(`↷ Page template ${result.name} ignored`, {
          level: 'info',
        });

        break;
      }

      case PAGE_TEMPLATE_IMPORT_STATUS.INVALID: {
        log(
          `Page template ${result.name} not imported due to the following errors`,
          {
            level: 'error',
          }
        );

        log(`ERROR: ${result.errorMessage}`, {
          level: 'error',
        });

        break;
      }

      default:
        break;
    }
  });
}
