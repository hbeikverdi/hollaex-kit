import React from 'react';
import { reduxForm } from 'redux-form';
import ReactSVG from 'react-svg';

import { Button, ActionNotification } from '../../components';
import renderFields from '../../components/Form/factoryFields';
import STRINGS from '../../config/localizedStrings';
import { ICONS } from '../../config/constants';
import { getErrorLocalized } from '../../utils/errors';

export const FORM_NAME = 'termsAndConditionForm';

const Form = ({
    formFields,
    handleSubmit,
    error,
    submitting,
    valid
}) => {
	return (
		<form onSubmit={handleSubmit} className="w-100">
			<div className="w-100">
                {renderFields(formFields)}
                <div className="download-wrapper pointer mb-3">
                    <ReactSVG path={ICONS.ARROW_TRANSFER_HISTORY_ACTIVE} wrapperClassName="download_pdf-svg" />
                    <a href="https://hollaex.com/docs/agreement.pdf" target="_blank"><div className="ml-2">{STRINGS.TERMS_OF_SERVICES.DOWNLOAD_PDF}</div></a>
                </div>
				{error && (
					<div className="warning_text error_text">
						{getErrorLocalized(error)}
					</div>
				)}
			</div>
            <Button
                label={STRINGS.TERMS_OF_SERVICES.PROCEED}
                disabled={!!error || submitting || !valid}
            />
		</form>
	);
};
export default reduxForm({
	form: FORM_NAME
})(Form);
