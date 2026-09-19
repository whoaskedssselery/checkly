/**
 * The board's shareable identity.
 *
 * A board that two other people are supposed to join needs something you can
 * actually send them, so the code is a first-class fact rather than a label
 * invented for the header. It is still fixed here: there is one board and no
 * server to mint codes yet.
 */
export const BOARD_ID = 'board-1'
export const BOARD_CODE = 'CHK-B1D4'
