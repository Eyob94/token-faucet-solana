use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("23DyhF7vgaTFYoFPMXUEk1ZxWeuoV5ghEnYPdv2vmAXv");

#[program]
pub mod token_faucet {
    use anchor_spl::token::{self, MintTo};

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.is_initialized = true;
        state.mint = ctx.accounts.mint.key();
        state.bump = ctx.bumps.authority;

        msg!("State successfully initialized ");
        Ok(())
    }

    pub fn dispense(ctx: Context<Dispense>, amount: u64) -> Result<()> {
        let state = &ctx.accounts.state;

        if !state.is_initialized {
            return Err(crate::ErrorCode::Uninitialized.into());
        }

        if state.mint != ctx.accounts.mint.key() {
            return Err(crate::ErrorCode::MintMismatch.into());
        }

        let seeds = &["faucet".as_bytes(), &[state.bump]];

        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            signer,
        );

        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer=payer, space = 8+State::LEN)]
    pub state: Account<'info, State>,
    #[account(init, seeds = [b"faucet_mint"], bump, payer=payer, mint::decimals = 9, mint::authority = authority   )]
    pub mint: Account<'info, Mint>,

    /// CHECK: This is fine
    #[account(seeds=[b"faucet"], bump)]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Dispense<'info> {
    #[account(has_one=mint)]
    pub state: Account<'info, State>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
    ///CHECK:
    #[account(seeds=[b"faucet"], bump=state.bump)]
    pub authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct State {
    pub is_initialized: bool,
    pub mint: Pubkey,
    pub bump: u8,
}

impl State {
    pub const LEN: usize = 1 + 32 + 1;
}

#[error_code]
pub enum ErrorCode {
    #[msg("State is uninitialized")]
    Uninitialized,
    #[msg("Mint account does not match stored state")]
    MintMismatch,
    #[msg("Could not find PDA bump")]
    BumpError,
}
