export const ApiConstants = {
    // Invites
    GET_ALL_INVITES: 'https://3jj6aid0e9.execute-api.us-east-1.amazonaws.com/production/invite?userId=lakandula',
    GET_INVITE: 'https://3jj6aid0e9.execute-api.us-east-1.amazonaws.com/production/invite',
    CREATE_INVITES_BY_CSV_UPLOAD: 'https://3jj6aid0e9.execute-api.us-east-1.amazonaws.com/production/scramble',
    INCREMENT_COUNT_OF_INVITE_SENT: 'https://3jj6aid0e9.execute-api.us-east-1.amazonaws.com/production/scramble/increment',

    // RSVP
    GET_RSVPS: 'https://zwpa0q87rj.execute-api.us-east-1.amazonaws.com/production/rsvp',

    // Organizer / admin data
    GET_AND_PUT_ADMIN_ADDED_DATA_TO_RSVPS: 'https://2wuvopyls8.execute-api.us-east-1.amazonaws.com/production/organize',

    // Pre-checkins (reservations)
    GET_PRECHECKINS: 'https://tzali398y4.execute-api.us-east-1.amazonaws.com/production/pda-boracay-precheckins',

    // Save the date
    GET_SAVE_THE_DATE_RECORDS: 'https://vq852ax2pd.execute-api.us-east-1.amazonaws.com/production/records',

    // Surveys
    GET_ALL_SURVEYS: 'https://survey.pdaboracay.com/surveys',
    GET_SURVEY_COUNTS: 'https://survey.pdaboracay.com/surveys/count',

    // IP tracking
    GET_IP_ADDRESSES: 'https://nzlffyy1xc.execute-api.us-east-1.amazonaws.com/production',

    // Admin auth
    LOGIN: 'https://3n2p4mi9be.execute-api.us-east-1.amazonaws.com/production/login',

    // Guestbook wishes
    WISHES: 'https://aj1txs7d29.execute-api.us-east-1.amazonaws.com/production/wishes',

    // Media upload (share app)
    INITIATE_UPLOAD: 'https://8md5w6loti.execute-api.us-east-1.amazonaws.com/production/initiate',
    COMPLETE_UPLOAD: 'https://8md5w6loti.execute-api.us-east-1.amazonaws.com/production/complete',
} as const;
