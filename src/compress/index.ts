import {
  ADD_DEPLOYMENT_DESCRIPTOR_VAR,
  DEPLOYMENT_DESCRIPTOR_COMPANY_VAR,
  DEPLOYMENT_DESCRIPTOR_GROUP_VAR,
} from '../utils/constants';
import CustomGenerator from '../utils/custom-generator';
import compress from './compress';

export default class extends CustomGenerator {
  async asking(): Promise<void> {
    await this.ask([
      {
        type: 'confirm',
        name: ADD_DEPLOYMENT_DESCRIPTOR_VAR,
        message: 'Add deployment descriptor?',
        default: true,
        when: !this.hasValue(ADD_DEPLOYMENT_DESCRIPTOR_VAR),
      },
    ]);

    if (this.answers[ADD_DEPLOYMENT_DESCRIPTOR_VAR]) {
      await this.ask([
        {
          type: 'input',
          name: DEPLOYMENT_DESCRIPTOR_COMPANY_VAR,
          message: 'Deployment descriptor company Web ID?',
          default: 'liferay.com',
          when: !this.hasValue(DEPLOYMENT_DESCRIPTOR_COMPANY_VAR),
        },
      ]);

      if (
        this.answers[DEPLOYMENT_DESCRIPTOR_COMPANY_VAR] &&
        this.answers[DEPLOYMENT_DESCRIPTOR_COMPANY_VAR] !== '*'
      ) {
        await this.ask([
          {
            type: 'input',
            name: DEPLOYMENT_DESCRIPTOR_GROUP_VAR,
            message: 'Deployment descriptor group key?',
            default: 'Guest',
            when: !this.hasValue(DEPLOYMENT_DESCRIPTOR_GROUP_VAR),
          },
        ]);
      }
    }

    await compress(this.destinationPath(), {
      [ADD_DEPLOYMENT_DESCRIPTOR_VAR]: this.getValue(
        ADD_DEPLOYMENT_DESCRIPTOR_VAR
      ),
      [DEPLOYMENT_DESCRIPTOR_COMPANY_VAR]: this.getValue(
        DEPLOYMENT_DESCRIPTOR_COMPANY_VAR
      ),
      [DEPLOYMENT_DESCRIPTOR_GROUP_VAR]: this.getValue(
        DEPLOYMENT_DESCRIPTOR_GROUP_VAR
      ),
    });
  }
}